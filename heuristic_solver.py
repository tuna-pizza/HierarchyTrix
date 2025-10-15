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
    def count_crossings_fast(layout, edges_list):
        """Crossing counting"""
        crossings = 0
        node_positions = {node: idx for idx, node in enumerate(layout)}
        
        for i, (u1, v1) in enumerate(edges_list):
            u1_pos = node_positions[u1]
            v1_pos = node_positions[v1]
            
            for j, (u2, v2) in enumerate(edges_list):
                if i >= j:
                    continue
                    
                u2_pos = node_positions[u2]
                v2_pos = node_positions[v2]
                
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

    def verify_top_page_planarity_fast(G, layout):
        return count_crossings_fast(layout, top_edges) == 0

    def swap_adjacent_siblings_fast(current_layout, siblings):
        """Fast adjacent sibling swapping - try all adjacent pairs"""
        sibling_indices = []
        for s in siblings:
            try:
                idx = current_layout.index(s)
                sibling_indices.append(idx)
            except ValueError:
                continue
        
        if len(sibling_indices) < 2:
            return current_layout
            
        sibling_indices.sort()
        
        best_layout = current_layout.copy()
        best_crossings = count_crossings_fast(current_layout, bottom_edges)
        
        # Try swapping each adjacent pair of siblings
        for i in range(len(sibling_indices) - 1):
            new_layout = current_layout.copy()
            idx1, idx2 = sibling_indices[i], sibling_indices[i+1]
            new_layout[idx1], new_layout[idx2] = new_layout[idx2], new_layout[idx1]
            
            # Verify planarity and check crossings
            if verify_top_page_planarity_fast(G, new_layout):
                crossings = count_crossings_fast(new_layout, bottom_edges)
                if crossings < best_crossings:
                    best_layout = new_layout
                    best_crossings = crossings
        
        return best_layout

    def barycenter_ordering(siblings, current_layout, bottom_edges):
        """Order siblings by average position of connected nodes (barycenter method)"""
        node_positions = {node: current_layout.index(node) for node in current_layout}
        
        def compute_barycenter(node):
            connected_positions = []
            for u, v in bottom_edges:
                if u == node: 
                    connected_positions.append(node_positions[v])
                if v == node: 
                    connected_positions.append(node_positions[u])
            return sum(connected_positions) / len(connected_positions) if connected_positions else node_positions[node]
        
        return sorted(siblings, key=compute_barycenter)

    def connectivity_ordering(siblings, bottom_edges):
        """Order siblings by their connectivity (degree) in bottom edges"""
        def bottom_degree(node):
            degree = 0
            for u, v in bottom_edges:
                if u == node or v == node:
                    degree += 1
            return degree
        
        return sorted(siblings, key=bottom_degree, reverse=True)

    def find_problematic_sibling_groups(G, current_layout, bottom_edges, top_n=5):
        """Identify sibling groups that cause the most crossings"""
        sibling_groups = {}
        for node in G.nodes():
            children = [v for u, v in G.edges(node) if G[u][v]['type'] == 'top']
            if len(children) > 1:
                sibling_groups[node] = children
        
        group_scores = {}
        node_positions = {node: idx for idx, node in enumerate(current_layout)}
        
        for parent, siblings in sibling_groups.items():
            crossing_count = 0
            sibling_indices = [node_positions[s] for s in siblings]
            min_idx, max_idx = min(sibling_indices), max(sibling_indices)
            
            # Count crossings involving these siblings
            for i, (u1, v1) in enumerate(bottom_edges):
                if u1 not in siblings and v1 not in siblings:
                    continue
                    
                u1_pos = node_positions[u1]
                v1_pos = node_positions[v1]
                
                for j, (u2, v2) in enumerate(bottom_edges):
                    if i >= j:
                        continue
                    if u2 not in siblings and v2 not in siblings:
                        continue
                        
                    u2_pos = node_positions[u2]
                    v2_pos = node_positions[v2]
                    
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
                        crossing_count += 1
            
            group_scores[parent] = crossing_count
        
        # Return top N most problematic groups
        sorted_groups = sorted(group_scores.items(), key=lambda x: x[1], reverse=True)
        return [(parent, sibling_groups[parent]) for parent, score in sorted_groups[:top_n] if score > 0]

    def apply_sibling_order_fast(current_layout, siblings, min_pos, max_pos, new_order):
        """sibling reordering"""
        new_layout = current_layout.copy()
        new_block = []
        order_iter = iter(new_order)
        
        for node in current_layout[min_pos:max_pos+1]:
            if node in siblings:
                new_block.append(next(order_iter))
            else:
                new_block.append(node)
        
        new_layout[min_pos:max_pos+1] = new_block
        return new_layout

    def optimize_multi_strategy(G, initial_layout):
        """
        Optimizes layout by iteratively applying multiple sibling-ordering strategies.
        Includes cluster, leaf-descendant, and local block inversion strategies.
        """
        current_layout = initial_layout.copy()
        current_crossings = count_crossings_fast(current_layout, bottom_edges)

        def get_leaf_descendants(node):
            leaves = []
            for child in G.successors(node):
                if G[node][child]['type'] == 'top':
                    children = [v for u, v in G.edges(child) if G[u][v]['type'] == 'top']
                    if not children:
                        leaves.append(child)
                    else:
                        leaves.extend(get_leaf_descendants(child))
            return leaves

        sibling_groups = {}
        for node in G.nodes():
            children = [v for u, v in G.edges(node) if G[u][v]['type'] == 'top']
            if len(children) > 1:
                sibling_groups[node] = children

        problematic_groups = find_problematic_sibling_groups(
            G, current_layout, bottom_edges, top_n=min(10, len(sibling_groups))
        )
        remaining_groups = [
            (p, s) for p, s in sibling_groups.items() if p not in [pg[0] for pg in problematic_groups]
        ]
        all_groups = problematic_groups + remaining_groups

        print(f"\nDEBUG: Starting optimization with {len(all_groups)} sibling groups\n")

        def find_cluster_block(layout, siblings):
            indices = [layout.index(s) for s in siblings]
            min_i, max_i = min(indices), max(indices)
            return layout[min_i:max_i + 1]

        for parent, siblings in all_groups:
            if len(siblings) < 2:
                continue

            has_bottom_edges = any(u in siblings or v in siblings for u, v in bottom_edges)
            if not has_bottom_edges:
                continue

            sibling_positions = [current_layout.index(s) for s in siblings]
            min_pos, max_pos = min(sibling_positions), max(sibling_positions)

            improved = True
            iteration = 0

            print(f"\nDEBUG: Optimizing siblings of parent '{parent}': {siblings}")

            while improved:
                improved = False
                iteration += 1

                current_order = [node for node in current_layout[min_pos:max_pos + 1] if node in siblings]
                base_crossings = count_crossings_fast(current_layout, bottom_edges)

                strategies = []

                # 1️⃣ Reverse direct siblings
                strategies.append(("reverse_siblings", list(reversed(current_order))))

                # 2️⃣ Reverse contiguous cluster
                cluster_block = find_cluster_block(current_layout, siblings)
                if len(cluster_block) > len(siblings):
                    strategies.append(("reverse_cluster", list(reversed(cluster_block))))

                # 3️⃣ Reverse all leaf descendants (multi-level)
                leaf_descendants = get_leaf_descendants(parent)
                if len(leaf_descendants) > 1:
                    strategies.append(("reverse_leaf_descendants", list(reversed(leaf_descendants))))

                # 4️⃣ NEW: Local block inversions (try reversing partial sibling segments)
                if len(siblings) > 3:
                    for block_size in range(2, min(len(siblings), 5)):  # try blocks of 2–4
                        for i in range(len(siblings) - block_size + 1):
                            block = siblings[i:i + block_size]
                            new_order = siblings.copy()
                            new_order[i:i + block_size] = reversed(block)
                            strategies.append((f"reverse_block_{i}_{block_size}", new_order))

                # 5️⃣ Barycenter
                strategies.append(("barycenter", barycenter_ordering(siblings, current_layout, bottom_edges)))

                # 6️⃣ Connectivity
                strategies.append(("connectivity", connectivity_ordering(siblings, bottom_edges)))

                # 7️⃣ Random for small groups
                if len(siblings) <= 6:
                    for _ in range(5):
                        random_order = current_order.copy()
                        random.shuffle(random_order)
                        strategies.append(("random", random_order))

                # --- Evaluate all strategies ---
                best_layout = current_layout
                best_crossings = base_crossings
                selected_strategy = None
                debug_tried = []

                for strategy_name, new_order in strategies:
                    debug_tried.append(strategy_name)

                    # Apply appropriate layout transformation
                    if strategy_name == "reverse_cluster":
                        min_c = current_layout.index(cluster_block[0])
                        max_c = current_layout.index(cluster_block[-1])
                        new_layout = apply_sibling_order_fast(current_layout, cluster_block, min_c, max_c, new_order)
                    elif strategy_name == "reverse_leaf_descendants":
                        leaf_positions = [current_layout.index(n) for n in leaf_descendants]
                        min_l, max_l = min(leaf_positions), max(leaf_positions)
                        new_layout = apply_sibling_order_fast(current_layout, leaf_descendants, min_l, max_l, new_order)
                    else:
                        new_layout = apply_sibling_order_fast(current_layout, siblings, min_pos, max_pos, new_order)

                    # Only keep planar top layout
                    if not verify_top_page_planarity_fast(G, new_layout):
                        continue

                    new_crossings = count_crossings_fast(new_layout, bottom_edges)
                    if new_crossings < best_crossings:
                        best_layout = new_layout
                        best_crossings = new_crossings
                        selected_strategy = strategy_name

                # --- Update after iteration ---
                if selected_strategy:
                    print(f"  Iter {iteration}: Selected '{selected_strategy}' → crossings {base_crossings} → {best_crossings}")
                    current_layout = best_layout
                    current_crossings = best_crossings
                    improved = True
                else:
                    print(f"  Iter {iteration}: Tried {debug_tried} — no improvement")

            print(f"DEBUG: Finished parent '{parent}' with {current_crossings} total crossings")

        print(f"\n✅ Final optimization complete. Remaining crossings: {current_crossings}\n")
        return current_layout


    def iterative_refinement(G, initial_layout, max_iterations=3):
        """Iteratively refine the solution"""
        current_layout = initial_layout
        current_crossings = count_crossings_fast(current_layout, bottom_edges)
        
        for iteration in range(max_iterations):
            new_layout = optimize_multi_strategy(G, current_layout)
            new_crossings = count_crossings_fast(new_layout, bottom_edges)
            
            improvement = current_crossings - new_crossings
            if improvement > 0:
                current_layout = new_layout
                current_crossings = new_crossings
            else:
                print(f"Iteration {iteration + 1}: No improvement, stopping early")
                break
        
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
    
    initial_top_crossings = count_crossings_fast(layout, top_edges)
    initial_bottom_crossings = count_crossings_fast(layout, bottom_edges)
    
    print(f"DEBUG: Initial top crossings: {initial_top_crossings} (should be 0)")
    print(f"DEBUG: Initial bottom crossings: {initial_bottom_crossings}")

    # Optimize sibling order to reduce bottom crossings
    final_layout = optimize_multi_strategy(G, layout)
    
    # Final verification
    final_top_crossings = count_crossings_fast(final_layout, top_edges)
    final_bottom_crossings = count_crossings_fast(final_layout, bottom_edges)

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