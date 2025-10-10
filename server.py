from flask import Flask, send_from_directory, jsonify, make_response
import json
import os
import re
import sys

print("=== STARTING SERVER IN WINDOWS ===")

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

if __name__ == "__main__":
    print("Server running on http://localhost:3000")
    app.run(port=3000, debug=True)