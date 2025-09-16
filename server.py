from flask import Flask, send_from_directory, jsonify, make_response
import json
import os
import re
from python.call import generate_order


# Create Flask app
app = Flask(__name__, static_folder="public")

# Directory where JSON files are stored
GRAPH_DIR = os.path.abspath(os.path.join("data", "graphs"))
ORDER_DIR = os.path.join("data", "order")
CALL_SCRIPT = os.path.join("python", "call.py")

os.makedirs(ORDER_DIR, exist_ok=True)

@app.route("/")
def serve_index():
    response = make_response(send_from_directory(app.static_folder, "index.html"))
    response.headers["Content-Type"] = "text/html; charset=utf-8"
    return response

@app.route("/<path:path>")
def serve_static(path):
    response = make_response(send_from_directory(app.static_folder, path))
    if path.endswith(".html"):
        response.headers["Content-Type"] = "text/html; charset=utf-8"
    if path.endswith(".js"):
        response.headers["Content-Type"] = "application/javascript; charset=utf-8"
    elif path.endswith(".css"):
        response.headers["Content-Type"] = "text/css; charset=utf-8"
    return response

@app.route("/api/graph/<instance>")
def get_graph(instance):
    """Return JSON content of a given graph file inside GRAPH_DIR"""
    # Only allow letters, numbers, underscores, and dashes
    if not re.fullmatch(r"[A-Za-z0-9_-]+", instance):
        return jsonify({"error": "Invalid instance name"}), 400
        
    # Build the absolute path safely
    safe_path = os.path.abspath(os.path.join(GRAPH_DIR, instance + ".json"))

    # Check if the resolved path is still inside GRAPH_DIR
    if not safe_path.startswith(GRAPH_DIR + os.sep):
        return jsonify({"error": "Invalid path"}), 400

    # Check file existence
    if not os.path.isfile(safe_path):
        return jsonify({"error": f"File {instance}.json not found"}), 404

    # Try to read JSON
    try:
        with open(safe_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        response = make_response(jsonify(data))
        response.headers["Content-Type"] = "application/json; charset=utf-8"
        return response
        # return jsonify(data)
    except Exception as e:
        return jsonify({
            "error": f"Failed to read {instance}.json",
            "details": str(e)
        }), 500

@app.route("/api/order/<instance>")
def get_order(instance):
    # Only allow letters, numbers, underscores, and dashes
    if not re.fullmatch(r"[A-Za-z0-9_-]+", instance):
        return jsonify({"error": "Invalid instance name"}), 400

    # Construct the requested file path
    filepath = os.path.join(ORDER_DIR, f"{instance}.txt")

    # Absolute path check (extra safety)
    abs_path = os.path.abspath(filepath)
    abs_order_dir = os.path.abspath(ORDER_DIR)
    if not abs_path.startswith(abs_order_dir + os.sep):
        return jsonify({"error": "Invalid instance path"}), 400

    try:
        # If file exists, read it
        if os.path.isfile(abs_path):
            with open(abs_path, "r", encoding="utf-8") as f:
                order_string = f.read()
        else:
            # Generate the order string (call your function)
            order_string = generate_order(instance)

            # Ensure the folder exists
            os.makedirs(abs_order_dir, exist_ok=True)

            # Write to file
            with open(abs_path, "w", encoding="utf-8") as f:
                f.write(order_string)
        response = make_response(jsonify({"order": order_string}))
        response.headers["Content-Type"] = "application/json; charset=utf-8"
        return response
        #return jsonify({"order": order_string})

    except Exception as e:
        return jsonify({"error": "Failed to get or create order", "details": str(e)}), 500


if __name__ == "__main__":
    # Run server on http://localhost:3000
    app.run(port=3000, debug=True)
