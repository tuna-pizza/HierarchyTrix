import os
import sys

# Add the parent directory to the path so we can import nodetrix_clean
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.insert(0, parent_dir)

from nodetrix_clean import solve_layout_for_graph

def generate_order(instance):
    """
    This function is called by the server to generate the order
    """
    try:
        # Construct path to graph file
        graph_file = os.path.join("data", "graphs", f"{instance}.json")
        
        if not os.path.exists(graph_file):
            return ""
        
        # Call the solver
        leaf_order = solve_layout_for_graph(graph_file)
        
        if leaf_order:
            return " ".join(leaf_order)
        else:
            return ""
            
    except Exception as e:
        print(f"Error in generate_order: {e}")
        return ""