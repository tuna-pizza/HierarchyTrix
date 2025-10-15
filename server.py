from flask import Flask, send_from_directory, jsonify, request
import json
import os
import re
import uuid
import sys
import io
import networkx as nx

print("=== STARTING SERVER ===")

# --- Graph validation ---
def validate_graph_structure(data):
    if not isinstance(data, dict):
        return False, "Root element must be a JSON object"

    if "nodes" not in data or "edges" not in data:
        return False, "Missing required keys: 'nodes' and/or 'edges'"

    if not isinstance(data["nodes"], list) or not isinstance(data["edges"], list):
        return False, "'nodes' and 'edges' must be lists"

    node_ids = set()
    for n in data["nodes"]:
        if not all(k in n for k in ("id", "parent", "type")):
            return False, "Each node must have 'id', 'parent', and 'type'"
        node_ids.add(n["id"])

    for n in data["nodes"]:
        parent = n["parent"]
        if parent is not None and parent not in node_ids:
            return False, f"Parent '{parent}' of node '{n['id']}' not found"

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

    children_map = {}
    for n in data["nodes"]:
        parent = n["parent"]
        if parent:
            children_map.setdefault(parent, []).append(n["id"])
    for n in data["nodes"]:
        if n["type"] == "cluster":
            if n["id"] not in children_map or len(children_map[n["id"]]) == 0:
                return False, f"Cluster '{n['id']}' has no children"

    for e in data["edges"]:
        if not all(k in e for k in ("source", "target")):
            return False, "Each edge must have 'source' and 'target'"
        if e["source"] not in node_ids or e["target"] not in node_ids:
            return False, f"Edge connects unknown node(s): {e}"

    return True, "Graph structure is valid"

# --- Add current directory to path ---
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

try:
    from nodetrix_clean import solve_layout_for_graph
    print("✓ ILP Solver imported successfully")
except ImportError as e:
    print(f"✗ ILP Solver import failed: {e}")

try:
    from heuristic_solver import solve_layout_for_graph_heuristic
    print("✓ Heuristic Solver imported successfully")
except ImportError as e:
    print(f"✗ Heuristic Solver import failed: {e}")
try:
    from hybrid_solver import solve_layout_for_graph_hybrid
    print("✓ Hybrid Solver imported successfully")
except ImportError as e:
    print(f"✗ Hybrid Solver import failed: {e}")

# --- Flask app ---
app = Flask(__name__, static_folder="public")

GRAPH_DIR = os.path.abspath(os.path.join("data", "graphs"))
ORDER_DIR = os.path.join("data", "order")
os.makedirs(GRAPH_DIR, exist_ok=True)
os.makedirs(ORDER_DIR, exist_ok=True)


# --- Helper: convert JSON graph to NetworkX DiGraph ---
def dict_to_nx_graph(data):
    G = nx.DiGraph()
    for n in data["nodes"]:
        node_type = n.get("type") or "node"
        G.add_node(str(n["id"]), type=node_type, parent=n.get("parent"))
    for e in data["edges"]:
        G.add_edge(str(e["source"]), str(e["target"]), type=e.get("type", "bottom"))
    return G


# --- Generate order (ILP or heuristic) ---
def generate_order(instance, method="ilp"):
    """
    Generate node order for a graph instance.
    method: "ilp", "heuristic", or "hybrid"
    Returns a space-separated string of node IDs.
    """
    graph_file = os.path.join(GRAPH_DIR, f"{instance}.json")
    if not os.path.exists(graph_file):
        print(f"❌ Graph file not found: {graph_file}")
        return ""

    try:
        if method == "heuristic":
            print("🎯 EXECUTING HEURISTIC SOLVER")
            try:
                print(f"🔧 Running heuristic solver for {instance}")
                G = dict_to_nx_graph(json.load(open(graph_file, "r", encoding="utf-8")))
                layout = solve_layout_for_graph_heuristic(G)

                if not layout:
                    print("❌ Heuristic solver returned empty layout")
                    return []

                return " ".join(layout)
            except Exception as e:
                print(f"❌ Error in heuristic solver: {e}")
                import traceback
                traceback.print_exc()
                return []

        elif method == "hybrid":
            print("🎯 EXECUTING HYBRID SOLVER")
            try:
                print(f"🔀 Running TRUE HYBRID solver for {instance}")
                hybrid_order = solve_layout_for_graph_hybrid(graph_file)
                
                if hybrid_order:
                    order_string = " ".join(hybrid_order)
                    print(f"✅ TRUE HYBRID order generated: {len(hybrid_order)} nodes")
                    return order_string
                else:
                    print("❌ TRUE HYBRID solver failed, falling back to heuristic")
                    return generate_order(instance, "heuristic")
                    
            except Exception as e:
                print(f"❌ Error in TRUE hybrid solver: {e}")
                import traceback
                traceback.print_exc()
                return generate_order(instance, "heuristic")

        else:  # default ILP
            print("🎯 EXECUTING ILP SOLVER")
            print(f"🔧 Running ILP solver for {instance}")
            leaf_order = solve_layout_for_graph(graph_file)
            if not leaf_order:
                print("❌ ILP solver returned empty order")
                return ""

            order_string = " ".join(leaf_order)
            print(f"✅ ILP order generated: {len(leaf_order)} nodes")
            return order_string

    except Exception as e:
        print(f"❌ Error in {method} solver: {e}")
        import traceback
        traceback.print_exc()
        return ""

# --- Flask routes ---
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


@app.route("/api/order/<instance>")
def get_order(instance):
    method = request.args.get("method") or request.args.get("solver") or "ilp"
    method = method.lower()
    
    print(f"🔍 DEBUG: Requested method = '{method}'")
     
    if method not in ["ilp", "heuristic", "hybrid"]:
        return jsonify({"error": "Invalid method. Use 'ilp', 'heuristic', or 'hybrid'"}), 400

    # Fix the suffix assignment for hybrid method
    if method == "heuristic":
        suffix = "_heuristic"
    elif method == "hybrid":
        suffix = "_hybrid"
    else:  # ilp
        suffix = "_ilp"

    filepath = os.path.join(ORDER_DIR, f"{instance}{suffix}.txt")
    try:
        if os.path.isfile(filepath):
            with open(filepath, "r", encoding="utf-8") as f:
                order_string = f.read()
        else:
            order_string = generate_order(instance, method)
            if order_string:
                with open(filepath, "w", encoding="utf-8") as f:
                    f.write(order_string if isinstance(order_string, str) else " ".join(order_string))
            else:
                return jsonify({"error": f"{method.capitalize()} solver failed"}), 500

        return jsonify({"order": order_string, "method": method})

    except Exception as e:
        return jsonify({"error": "Failed to get order", "details": str(e)}), 500


@app.route("/api/upload", methods=["POST"])
def upload_graph():
    if "file" not in request.files:
        return jsonify({"success": False, "message": "No file part provided"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"success": False, "message": "No selected file"}), 400

    if not file.filename.lower().endswith(".json"):
        return jsonify({"success": False, "message": "Only .json files are allowed"}), 400

    try:
        file_content = file.read().decode("utf-8")
        data = json.loads(file_content)
    except Exception as e:
        return jsonify({"success": False, "message": "Invalid JSON format", "details": str(e)}), 400

    is_valid, msg = validate_graph_structure(data)
    if not is_valid:
        return jsonify({"success": False, "message": "Invalid graph structure", "details": msg}), 400

    unique_name = uuid.uuid4().hex[:12]
    filename = f"{unique_name}.json"
    save_path = os.path.join(GRAPH_DIR, filename)

    while os.path.exists(save_path):
        unique_name = uuid.uuid4().hex[:12]
        filename = f"{unique_name}.json"
        save_path = os.path.join(GRAPH_DIR, filename)

    file.stream = io.BytesIO(file_content.encode("utf-8"))

    try:
        file.save(save_path)
    except Exception as e:
        if os.path.exists(save_path):
            try:
                os.remove(save_path)
                os.remove(os.path.join(ORDER_DIR, f"{unique_name}_ilp.txt"))
                os.remove(os.path.join(ORDER_DIR, f"{unique_name}_heuristic.txt"))
                os.remove(os.path.join(ORDER_DIR, f"{unique_name}_hybrid.txt"))
            except Exception as cleanup_err:
                print(f"Cleanup failed: {cleanup_err}")
        return jsonify({"success": False, "message": "Failed to save file", "details": str(e)}), 500

    return jsonify({"success": True, "message": "File uploaded and validated successfully", "filename": filename}), 201


@app.route("/api/download/<filename>", methods=["GET"])
def download_json(filename):
    if not re.match(r"^[A-Za-z0-9_-]+\.json$", filename):
        return jsonify({"success": False, "message": "Invalid file name or extension. Only .json files can be downloaded."}), 400

    try:
        return send_from_directory(directory=GRAPH_DIR, path=filename, as_attachment=True)
    except FileNotFoundError:
        return jsonify({"success": False, "message": f"File '{filename}' not found."}), 404
    except Exception as e:
        return jsonify({"success": False, "message": f"An error occurred during download: {str(e)}"}), 500


if __name__ == "__main__":
    print("Server running on http://localhost:3000")
    app.run(port=3000, debug=True)
