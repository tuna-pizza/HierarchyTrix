from flask import Flask, send_from_directory, jsonify, make_response, request
import json
import os
import re
import uuid
import sys
import io

print("=== STARTING SERVER IN WINDOWS ===")


def validate_graph_structure(data):
    # Basisstruktur prüfen
    if not isinstance(data, dict):
        return False, "Root element must be a JSON object"

    if "nodes" not in data or "edges" not in data:
        return False, "Missing required keys: 'nodes' and/or 'edges'"

    if not isinstance(data["nodes"], list) or not isinstance(data["edges"], list):
        return False, "'nodes' and 'edges' must be lists"

    # IDs extrahieren und prüfen
    node_ids = set()
    for n in data["nodes"]:
        if not all(k in n for k in ("id", "parent", "type")):
            return False, "Each node must have 'id', 'parent', and 'type'"
        node_ids.add(n["id"])

    # Eltern müssen existieren oder None sein
    for n in data["nodes"]:
        parent = n["parent"]
        if parent is not None and parent not in node_ids:
            return False, f"Parent '{parent}' of node '{n['id']}' not found"

    # Zyklusprüfung in Parent-Hierarchie
    graph = {n["id"]: n["parent"] for n in data["nodes"]}
    def has_cycle(node_id, visited):
        parent = graph.get(node_id)
        if parent is None:
            return False
        if parent in visited:
            return True
        return has_cycle(parent, visited | {parent})

    for nid in node_ids:
        if has_cycle(nid, {nid}):
            return False, f"Cycle detected in parent hierarchy starting at '{nid}'"

    # Cluster müssen mindestens ein Kind haben
    children_map = {}
    for n in data["nodes"]:
        parent = n["parent"]
        if parent:
            children_map.setdefault(parent, []).append(n["id"])

    for n in data["nodes"]:
        if n["type"] == "cluster":
            if n["id"] not in children_map or len(children_map[n["id"]]) == 0:
                return False, f"Cluster '{n['id']}' has no children"

    # Edges prüfen
    for e in data["edges"]:
        if not all(k in e for k in ("source", "target")):
            return False, "Each edge must have 'source' and 'target'"
        if e["source"] not in node_ids or e["target"] not in node_ids:
            return False, f"Edge connects unknown node(s): {e}"

    return True, "Graph structure is valid"

# Add current directory to path
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

try:
    from nodetrix_clean import solve_layout_for_graph
    print("✓ Solver imported successfully")
except ImportError as e:
    print(f"✗ Solver import failed: {e}")

app = Flask(__name__, static_folder="public")


GRAPH_DIR = os.path.abspath(os.path.join("data", "graphs"))

ORDER_DIR = os.path.join("data", "order")
os.makedirs(ORDER_DIR, exist_ok=True)

@app.route("/")
def serve_index():
    return send_from_directory(app.static_folder, "index.html")

@app.route("/<path:path>")
def serve_static(path):
    return send_from_directory(app.static_folder, path)

@app.route("/api/graph/<instance>")
def get_graph(instance):
    if not re.fullmatch(r"[A-Za-z0-9_-]+", instance):
        return jsonify({"error": "Invalid instance name"}), 400

    filepath = os.path.join(GRAPH_DIR, f"{instance}.json")
    abs_path = os.path.abspath(filepath)
    
    if not abs_path.startswith(GRAPH_DIR):
        return jsonify({"error": "Invalid instance path"}), 400

    try:
        with open(abs_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return jsonify(data)
    except FileNotFoundError:
        return jsonify({"error": "Graph not found"}), 404
    except Exception as e:
        return jsonify({"error": "Failed to load graph", "details": str(e)}), 500

def generate_order(instance):
    try:
        graph_file = os.path.join(GRAPH_DIR, f"{instance}.json")
        if not os.path.exists(graph_file):
            return ""
        
        leaf_order = solve_layout_for_graph(graph_file)
        return " ".join(leaf_order) if leaf_order else ""
    except Exception as e:
        print(f"Error in generate_order: {e}")
        return ""

@app.route("/api/order/<instance>")
def get_order(instance):
    if not re.fullmatch(r"[A-Za-z0-9_-]+", instance):
        return jsonify({"error": "Invalid instance name"}), 400

    filepath = os.path.join(ORDER_DIR, f"{instance}.txt")
    
    try:
        if os.path.isfile(filepath):
            with open(filepath, "r", encoding="utf-8") as f:
                order_string = f.read()
        else:
            order_string = generate_order(instance)
            if order_string:
                with open(filepath, "w", encoding="utf-8") as f:
                    f.write(order_string)
            else:
                return jsonify({"error": "Solver failed"}), 500
                 
        return jsonify({"order": order_string})

    except Exception as e:
        return jsonify({"error": "Failed to get order", "details": str(e)}), 500
        
@app.route("/api/upload", methods=["POST"])
def upload_graph():
    if "file" not in request.files:
        return jsonify({
            "success": False,
            "message": "No file part provided"
        }), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({
            "success": False,
            "message": "No selected file"
        }), 400

    if not file.filename.lower().endswith(".json"):
        return jsonify({
            "success": False,
            "message": "Only .json files are allowed"
        }), 400

    # JSON prüfen
    try:
        file_content = file.read().decode("utf-8")
        data = json.loads(file_content)
    except Exception as e:
        return jsonify({
            "success": False,
            "message": "Invalid JSON format",
            "details": str(e)
        }), 400

    # Struktur- & Konsistenzprüfung
    is_valid, msg = validate_graph_structure(data)
    if not is_valid:
        return jsonify({
            "success": False,
            "message": "Invalid graph structure",
            "details": msg
        }), 400

    # Zufälliger, 12-stelliger Dateiname (MOVED UP to be used for the order file)
    unique_name = uuid.uuid4().hex[:12]
    filename = f"{unique_name}.json"
    os.makedirs(GRAPH_DIR, exist_ok=True)
    save_path = os.path.join(GRAPH_DIR, filename)

    # Ensure unique name *before* proceeding (checks against GRAPH_DIR files)
    while os.path.exists(save_path):
        unique_name = uuid.uuid4().hex[:12]
        filename = f"{unique_name}.json"
        save_path = os.path.join(GRAPH_DIR, filename)

    
    # Stream neu setzen (zum Speichern)
    file.stream = io.BytesIO(file_content.encode("utf-8"))

    try:
        file.save(save_path)
    except Exception as e:
        # Aufräumen, falls Teildatei entstanden ist
        if os.path.exists(save_path):
            try:
                # IMPORTANT: Clean up the order file too if graph save fails!
                os.remove(os.path.join(ORDER_DIR, f"{unique_name}.txt"))
                os.remove(save_path)
            except Exception as cleanup_err:
                print(f"Cleanup failed: {cleanup_err}")
        return jsonify({
            "success": False,
            "message": "Failed to save file",
            "details": str(e)
        }), 500

    return jsonify({
        "success": True,
        "message": "File uploaded and validated successfully",
        "filename": filename
    }), 201

# Route to securely download only .json files from the data/graphs directory
@app.route("/api/download/<filename>", methods=["GET"])
def download_json(filename):
    # 1. ENFORCE .json EXTENSION AND VALID FILENAME PATTERN
    # We enforce that the filename must start with safe characters (alphanumeric, hyphen, underscore) 
    # and end exactly with ".json".
    if not re.match(r"^[A-Za-z0-9_-]+\.json$", filename):
        return jsonify({
            "success": False,
            "message": "Invalid file name or extension. Only .json files can be downloaded."
        }), 400

    # 2. SECURELY SERVE THE FILE
    try:
        # send_from_directory uses the absolute path of GRAPH_DIR and safely combines it with filename.
        # as_attachment=True ensures the file downloads instead of opening in the browser.
        return send_from_directory(
            directory=GRAPH_DIR, 
            path=filename,
            as_attachment=True
        )
    except FileNotFoundError:
        return jsonify({
            "success": False,
            "message": f"File '{filename}' not found."
        }), 404
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"An error occurred during download: {str(e)}"
        }), 500


if __name__ == "__main__":
    print("Server running on http://localhost:3000")
    app.run(port=3000, debug=True)