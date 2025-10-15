import os
import json
import networkx as nx
import time
import random
from typing import List

def solve_layout_for_graph_heuristic(graph_input) -> List[str]:
    """
    Heuristic solver for hierarchy layout.
    Accepts either a JSON path or a NetworkX DiGraph.
    Returns list of node IDs in leaf order.
    """

    # --- Load graph ---
    if isinstance(graph_input, str):
        # Load from JSON file
        graph_json_path = graph_input
        if not os.path.exists(graph_json_path):
            print(f"Error: File not found at {graph_json_path}")
            return []

        with open(graph_json_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        G = nx.DiGraph()
        
        # Add nodes
        for n in data["nodes"]:
            node_id = str(n["id"])
            parent = n.get("parent")
            parent_id = str(parent) if parent is not None else None
            node_type = "root" if parent_id is None else str(n.get("type", "node"))
            G.add_node(node_id, type=node_type, parent=parent_id)

        # Add top edges (parent-child relationships)
        for n in data["nodes"]:
            node_id = str(n["id"])
            parent = n.get("parent")
            if parent is not None:
                parent_id = str(parent)
                G.add_edge(parent_id, node_id, type="top")

        # Add bottom edges
        for e in data.get("edges", []):
            source = str(e["source"])
            target = str(e["target"])
            G.add_edge(source, target, type="bottom")

    elif isinstance(graph_input, nx.DiGraph):
        # Use the provided NetworkX graph directly
        G = graph_input
        
        # Reconstruct top edges from node parent attributes since edge types might be lost
        print("DEBUG: Reconstructing top edges from node parent attributes")
        for node_id, node_data in G.nodes(data=True):
            parent_id = node_data.get('parent')
            if parent_id is not None:
                # Ensure the top edge exists and is marked as top
                if G.has_edge(parent_id, node_id):
                    G[parent_id][node_id]['type'] = 'top'
                else:
                    G.add_edge(parent_id, node_id, type='top')
                    print(f"DEBUG: Added missing top edge: {parent_id} -> {node_id}")
    else:
        print("Error: Unsupported input type")
        return []

    # --- Collect edges - ROBUST APPROACH ---
    top_edges = []
    bottom_edges = []
    
    # Method 1: Check edge attributes
    for u, v, edge_data in G.edges(data=True):
        if edge_data.get('type') == 'top':
            top_edges.append((u, v))
        elif edge_data.get('type') == 'bottom':
            bottom_edges.append((u, v))
        else:
            # Method 2: If no type, infer from parent-child relationships
            if G.nodes[v].get('parent') == u:
                top_edges.append((u, v))
                print(f"DEBUG: Inferred top edge from parent: {u} -> {v}")
            else:
                bottom_edges.append((u, v))
                print(f"DEBUG: Inferred bottom edge: {u} -> {v}")

    # Method 3: Fallback - build top edges from parent attributes
    if not top_edges:
        print("DEBUG: No top edges found via edge attributes, building from node parents")
        for node_id, node_data in G.nodes(data=True):
            parent_id = node_data.get('parent')
            if parent_id is not None and parent_id in G.nodes():
                top_edges.append((parent_id, node_id))
                # Also add the edge if it doesn't exist
                if not G.has_edge(parent_id, node_id):
                    G.add_edge(parent_id, node_id, type='top')

    print(f"DEBUG: Top edges count: {len(top_edges)}, Bottom edges count: {len(bottom_edges)}")
    if top_edges:
        print(f"DEBUG: Top edges: {top_edges}")
    if bottom_edges:
        print(f"DEBUG: Bottom edges: {bottom_edges}")

    # --- Build initial layout respecting hierarchy ---
    def build_initial_layout(G):
        layout = []
        visited = set()

        # Find root nodes (nodes with no parent)
        root_nodes = [n for n, attr in G.nodes(data=True) if attr.get('parent') is None]
        
        print(f"DEBUG: Root nodes: {root_nodes}")

        def dfs(node):
            if node in visited:
                return
            visited.add(node)
            layout.append(node)
            
            # Get children via top edges
            children = [v for u, v in top_edges if u == node]
            
            # Sort children for consistent ordering
            for child in sorted(children):
                dfs(child)

        for root in sorted(root_nodes):
            dfs(root)

        # Check for unvisited nodes (indicates problem with top edges)
        unvisited = [n for n in G.nodes() if n not in visited]
        if unvisited:
            print(f"DEBUG: {len(unvisited)} unvisited nodes (top edge issue): {unvisited}")
            # Add them at the end
            for node in unvisited:
                layout.append(node)

        return layout

    # --- Count crossings - ACCURATE VERSION ---
    def count_crossings(layout, edges):
        if not edges:
            return 0
        crossings = 0
        pos = {n: i for i, n in enumerate(layout)}

        for i in range(len(edges)):
            u1, v1 = edges[i]
            if u1 not in pos or v1 not in pos:
                continue
            u1_pos, v1_pos = pos[u1], pos[v1]

            for j in range(i + 1, len(edges)):
                u2, v2 = edges[j]
                if u2 not in pos or v2 not in pos:
                    continue
                u2_pos, v2_pos = pos[u2], pos[v2]

                patterns = [
                    (u1_pos < u2_pos < v1_pos < v2_pos),
                    (u1_pos < v2_pos < v1_pos < u2_pos),
                    (v1_pos < u2_pos < u1_pos < v2_pos),
                    (v1_pos < v2_pos < u1_pos < u2_pos),
                    (u2_pos < u1_pos < v2_pos < v1_pos),
                    (u2_pos < v1_pos < v2_pos < u1_pos),
                    (v2_pos < u1_pos < u2_pos < v1_pos),
                    (v2_pos < v1_pos < u2_pos < u1_pos)
                ]
                if any(patterns):
                    crossings += 1
        return crossings


    # --- Verify top edges are planar ---
    def verify_top_planarity(layout):
        top_crossings = count_crossings(layout, top_edges)
        return top_crossings == 0
    
    # --- Helper heuristics ---
    def barycenter_ordering(group, pos):
        def barycenter(node):
            connected = []
            for u, v in bottom_edges:
                if u == node and v in pos:
                    connected.append(pos[v])
                elif v == node and u in pos:
                    connected.append(pos[u])
            return sum(connected) / len(connected) if connected else pos[node]
        return sorted(group, key=barycenter)

    def connectivity_ordering(group):
        def degree(node):
            return sum(1 for u, v in bottom_edges if u == node or v == node)
        return sorted(group, key=degree, reverse=True)

    # --- Optimize sibling order (Enhanced Version) ---
    def optimize_siblings(layout):
        current_layout = layout.copy()

        # Build parent-child relationships from top edges
        parent_to_children = {}
        for parent, child in top_edges:
            parent_to_children.setdefault(parent, []).append(child)

        # Filter for actual sibling groups
        siblings = {p: c for p, c in parent_to_children.items() if len(c) > 1}
        if not siblings:
            print("DEBUG: No sibling groups found")
            return current_layout

        pos = {n: i for i, n in enumerate(current_layout)}

        def barycenter(node):
            connected = [
                pos[v] if u == node and v in pos else pos[u]
                for u, v in bottom_edges
                if (u == node and v in pos) or (v == node and u in pos)
            ]
            return sum(connected) / len(connected) if connected else pos[node]

        def connectivity_ordering(group):
            def degree(node):
                return sum(1 for u, v in bottom_edges if u == node or v == node)
            return sorted(group, key=degree, reverse=True)

        improved = True
        max_passes = 3

        for pass_num in range(max_passes):
            if not improved:
                break
            improved = False

            print(f"DEBUG: Optimization pass {pass_num + 1}")
            for parent, group in siblings.items():
                group_positions = [pos[n] for n in group if n in pos]
                if not group_positions:
                    continue
                min_pos, max_pos = min(group_positions), max(group_positions)
                current_order = [n for n in current_layout[min_pos:max_pos + 1] if n in group]

                # Candidate strategies
                candidate_orders = [
                    ("barycenter", sorted(group, key=barycenter)),
                    ("connectivity", connectivity_ordering(group)),
                ]

                # Random search for small sibling groups
                if len(group) <= 6:
                    for _ in range(5):
                        shuffled = group.copy()
                        random.shuffle(shuffled)
                        candidate_orders.append(("random", shuffled))

                old_crossings = count_crossings(current_layout, bottom_edges)
                best_order = current_order
                best_crossings = old_crossings

                # Try each strategy
                for name, new_order in candidate_orders:
                    if new_order == current_order:
                        continue

                    new_block = []
                    order_iter = iter(new_order)
                    new_layout = current_layout.copy()

                    for node in current_layout[min_pos:max_pos + 1]:
                        new_block.append(next(order_iter) if node in group else node)
                    new_layout[min_pos:max_pos + 1] = new_block

                    if not verify_top_planarity(new_layout):
                        continue

                    new_crossings = count_crossings(new_layout, bottom_edges)
                    if new_crossings < best_crossings:
                        best_order = new_order
                        best_crossings = new_crossings
                        best_layout = new_layout

                # If improvement found, apply best
                if best_crossings < old_crossings:
                    current_layout = best_layout
                    pos = {n: i for i, n in enumerate(current_layout)}
                    improved = True
                    print(f"✅ Improved {parent}: {old_crossings} → {best_crossings}")

        return current_layout


    # --- Run heuristic ---
    start_time = time.time()
    
    # Build initial DFS layout (guaranteed planar for top edges)
    layout = build_initial_layout(G)
    if not layout:
        print("❌ Layout empty!")
        return []

    print(f"DEBUG: Initial layout length: {len(layout)}")
    print(f"DEBUG: Initial layout: {layout}")
    
    initial_top_crossings = count_crossings(layout, top_edges)
    initial_bottom_crossings = count_crossings(layout, bottom_edges)
    
    print(f"DEBUG: Initial top crossings: {initial_top_crossings} (should be 0)")
    print(f"DEBUG: Initial bottom crossings: {initial_bottom_crossings}")

    # Optimize sibling order to reduce bottom crossings
    final_layout = optimize_siblings(layout)
    
    # Final verification
    final_top_crossings = count_crossings(final_layout, top_edges)
    final_bottom_crossings = count_crossings(final_layout, bottom_edges)

    print(f"✅ Heuristic layout generated")
    print(f"Top edges: {len(top_edges)}, Bottom edges: {len(bottom_edges)}")
    print(f"Top crossings: {final_top_crossings} (should be 0)")
    print(f"Bottom crossings: {final_bottom_crossings}")
    print(f"Improvement: {initial_bottom_crossings - final_bottom_crossings} crossings reduced")
    print(f"Execution time: {time.time() - start_time:.3f}s")

    if final_top_crossings > 0:
        print("❌ WARNING: Top edges have crossings - this should not happen!")
    else:
        print("✅ Top edges are planar (no crossings)")

    return final_layout