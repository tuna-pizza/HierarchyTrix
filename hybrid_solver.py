import gurobipy as gp
import networkx as nx
import json
from itertools import combinations
from gurobipy import GRB
import time
from typing import List, Set, Dict, Tuple
import os
import traceback

def solve_layout_for_graph_hybrid(graph_json_path: str, time_limit: int = 300) -> List[str]:
    """
    FINAL HYBRID SOLVER: 
    Uses heuristic as base, applies simple improvements only
    """
    
    print("🚀 FINAL HYBRID SOLVER STARTING...")
    print(f"📁 Input file: {graph_json_path}")
    
    if not os.path.exists(graph_json_path):
        print(f"❌ Error: File not found at {graph_json_path}")
        return []

    try:
        # === STEP 1: GET HEURISTIC SOLUTION ===
        print("🔄 Step 1: Getting heuristic solution...")
        G = build_graph_from_json(graph_json_path)
        
        from heuristic_solver import solve_layout_for_graph_heuristic
        heuristic_layout = solve_layout_for_graph_heuristic(G)
        
        if not heuristic_layout:
            print("❌ Heuristic failed")
            return []
        
        # Calculate crossings
        top_edges = [(u, v) for u, v in G.edges() if G[u][v]['type'] == 'top']
        bottom_edges = [(u, v) for u, v in G.edges() if G[u][v]['type'] == 'bottom']
        
        heuristic_top_crossings = calculate_crossings(heuristic_layout, top_edges)
        heuristic_bottom_crossings = calculate_crossings(heuristic_layout, bottom_edges)
        
        print(f"✅ Heuristic: {heuristic_bottom_crossings} bottom crossings")
        
        if heuristic_top_crossings > 0:
            print("❌ Heuristic has top crossings - using as-is")
            return heuristic_layout

        # === STEP 2: APPLY SIMPLE POST-OPTIMIZATION ===
        print("🔧 Step 2: Applying simple post-optimization...")
        
        optimized_layout = heuristic_layout.copy()
        
        # --- Compute visible crossings for final layout ---
        visible_crossings = count_visible_crossings(G, optimized_layout, bottom_edges)
        print(f"Visible crossings (shown in visualization): {visible_crossings}")

        
        # Try simple local improvements
        improvement = apply_simple_improvements(G, optimized_layout, bottom_edges, top_edges)
        
        if improvement > 0:
            final_crossings = calculate_crossings(optimized_layout, bottom_edges)
            print(f"✅ SIMPLE IMPROVEMENT: {improvement} fewer crossings! ({heuristic_bottom_crossings} → {final_crossings})")
            return optimized_layout
        else:
            print("ℹ️  No improvements found - using heuristic solution")
            return heuristic_layout

    except Exception as e:
        print(f"❌ Hybrid solver error: {e}")
        traceback.print_exc()
        return heuristic_layout

def apply_simple_improvements(G, layout, bottom_edges, top_edges):
    """
    Apply simple, safe improvements that don't risk making things worse
    """
    original_crossings = calculate_crossings(layout, bottom_edges)
    best_layout = layout.copy()
    best_crossings = original_crossings
    
    # Strategy 1: Try swapping adjacent siblings
    improvement = try_adjacent_swaps(G, best_layout, bottom_edges, top_edges)
    if improvement > 0:
        return improvement
    
    # Strategy 2: Try reversing sibling groups
    improvement = try_group_reversals(G, best_layout, bottom_edges, top_edges)
    if improvement > 0:
        return improvement
    
    # Strategy 3: Try barycenter on problematic groups
    improvement = try_barycenter_fix(G, best_layout, bottom_edges, top_edges)
    
    return improvement

def try_adjacent_swaps(G, layout, bottom_edges, top_edges):
    """Try swapping adjacent nodes that are siblings"""
    positions = {node: idx for idx, node in enumerate(layout)}
    original_crossings = calculate_crossings(layout, bottom_edges)
    
    # Find all sibling groups
    sibling_groups = {}
    for node in G.nodes():
        children = [v for u, v in G.edges(node) if G[u][v]['type'] == 'top']
        if len(children) >= 2:
            sibling_groups[node] = children
    
    improved = False
    
    for parent, siblings in sibling_groups.items():
        # Get positions of siblings in layout
        sibling_positions = [(positions[s], s) for s in siblings if s in positions]
        sibling_positions.sort()
        
        # Try swapping adjacent siblings
        for i in range(len(sibling_positions) - 1):
            pos1, node1 = sibling_positions[i]
            pos2, node2 = sibling_positions[i + 1]
            
            # Only swap if they're adjacent in the layout
            if pos2 == pos1 + 1:
                # Try the swap
                test_layout = layout.copy()
                test_layout[pos1], test_layout[pos2] = test_layout[pos2], test_layout[pos1]
                
                # Check if it improves and maintains top planarity
                new_crossings = calculate_crossings(test_layout, bottom_edges)
                top_crossings = calculate_crossings(test_layout, top_edges)
                
                if top_crossings == 0 and new_crossings < original_crossings:
                    layout[:] = test_layout  # Apply the improvement
                    improvement = original_crossings - new_crossings
                    print(f"   ✅ Adjacent swap improved by {improvement}")
                    return improvement
    
    return 0

def try_group_reversals(G, layout, bottom_edges, top_edges):
    """Try reversing entire sibling groups"""
    positions = {node: idx for idx, node in enumerate(layout)}
    original_crossings = calculate_crossings(layout, bottom_edges)
    
    # Find sibling groups with high connectivity
    sibling_groups = {}
    for node in G.nodes():
        children = [v for u, v in G.edges(node) if G[u][v]['type'] == 'top']
        if len(children) >= 3:  # Only groups with 3+ siblings
            sibling_groups[node] = children
    
    for parent, siblings in sibling_groups.items():
        # Find the contiguous block containing these siblings
        sibling_indices = [positions[s] for s in siblings if s in positions]
        if len(sibling_indices) < 3:
            continue
            
        start_pos = min(sibling_indices)
        end_pos = max(sibling_indices)
        
        # Check if siblings form a contiguous block
        expected_size = end_pos - start_pos + 1
        actual_siblings_in_block = sum(1 for node in layout[start_pos:end_pos+1] if node in siblings)
        
        if actual_siblings_in_block == len(siblings):  # Contiguous block
            # Try reversing the sibling order
            test_layout = layout.copy()
            current_block = test_layout[start_pos:end_pos+1]
            
            # Reverse only the siblings within the block
            new_block = []
            siblings_reversed = [s for s in current_block if s in siblings][::-1]
            sibling_iter = iter(siblings_reversed)
            
            for node in current_block:
                if node in siblings:
                    new_block.append(next(sibling_iter))
                else:
                    new_block.append(node)
            
            test_layout[start_pos:end_pos+1] = new_block
            
            # Check if it improves
            new_crossings = calculate_crossings(test_layout, bottom_edges)
            top_crossings = calculate_crossings(test_layout, top_edges)
            
            if top_crossings == 0 and new_crossings < original_crossings:
                layout[:] = test_layout
                improvement = original_crossings - new_crossings
                print(f"   ✅ Group reversal improved by {improvement}")
                return improvement
    
    return 0

def try_barycenter_fix(G, layout, bottom_edges, top_edges):
    """Apply barycenter ordering to the most problematic group"""
    positions = {node: idx for idx, node in enumerate(layout)}
    original_crossings = calculate_crossings(layout, bottom_edges)
    
    # Find the most problematic sibling group
    problematic_group = find_most_problematic_group(G, layout, bottom_edges)
    if not problematic_group:
        return 0
    
    parent, siblings = problematic_group
    
    # Find the block containing these siblings
    sibling_indices = [positions[s] for s in siblings]
    start_pos = min(sibling_indices)
    end_pos = max(sibling_indices)
    current_block = layout[start_pos:end_pos+1]
    
    # Apply barycenter ordering
    def barycenter(node):
        connected_positions = []
        for u, v in bottom_edges:
            if u == node:
                connected_positions.append(positions[v])
            elif v == node:
                connected_positions.append(positions[u])
        return sum(connected_positions) / len(connected_positions) if connected_positions else positions[node]
    
    new_sibling_order = sorted(siblings, key=barycenter)
    current_sibling_order = [node for node in current_block if node in siblings]
    
    if new_sibling_order != current_sibling_order:
        # Apply new order
        test_layout = layout.copy()
        new_block = []
        sibling_iter = iter(new_sibling_order)
        
        for node in current_block:
            if node in siblings:
                new_block.append(next(sibling_iter))
            else:
                new_block.append(node)
        
        test_layout[start_pos:end_pos+1] = new_block
        
        # Check improvement
        new_crossings = calculate_crossings(test_layout, bottom_edges)
        top_crossings = calculate_crossings(test_layout, top_edges)
        
        if top_crossings == 0 and new_crossings < original_crossings:
            layout[:] = test_layout
            improvement = original_crossings - new_crossings
            print(f"   ✅ Barycenter fix improved by {improvement}")
            return improvement
    
    return 0

def find_most_problematic_group(G, layout, bottom_edges):
    """Find the sibling group causing the most crossings"""
    positions = {node: idx for idx, node in enumerate(layout)}
    
    # Find all sibling groups
    sibling_groups = {}
    for node in G.nodes():
        children = [v for u, v in G.edges(node) if G[u][v]['type'] == 'top']
        if len(children) >= 2:
            sibling_groups[node] = children
    
    best_group = None
    best_score = 0
    
    for parent, siblings in sibling_groups.items():
        score = 0
        # Count crossings involving these siblings
        for i, (u1, v1) in enumerate(bottom_edges):
            if u1 not in siblings and v1 not in siblings:
                continue
            for j, (u2, v2) in enumerate(bottom_edges):
                if i < j and (u2 in siblings or v2 in siblings):
                    if edges_cross(u1, v1, u2, v2, positions):
                        score += 1
        
        if score > best_score:
            best_score = score
            best_group = (parent, siblings)
    
    return best_group

def calculate_crossings(layout: List[str], edges: List[Tuple[str, str]]) -> int:
    """Calculate number of crossings in a layout"""
    crossings = 0
    pos = {node: idx for idx, node in enumerate(layout)}
    
    for i, (u1, v1) in enumerate(edges):
        for j, (u2, v2) in enumerate(edges):
            if i < j:
                if edges_cross(u1, v1, u2, v2, pos):
                    crossings += 1
    return crossings

# --- Count visible crossings (only for edges between different clusters) ---
def count_visible_crossings(G, layout: List[str], edges: List[Tuple[str, str]]) -> int:
    """
    Count crossings only for edges whose endpoints are in different clusters (different parents).
    """
    def norm_parent(p):
        return None if p is None or str(p) == 'None' or str(p) == '' else str(p)

    visible_edges = [
        (u, v) for u, v in edges
        if norm_parent(G.nodes[u].get("parent")) != norm_parent(G.nodes[v].get("parent"))
    ]

    return calculate_crossings(layout, visible_edges)


def edges_cross(u1, v1, u2, v2, positions):
    """Check if two edges cross"""
    if u1 not in positions or v1 not in positions or u2 not in positions or v2 not in positions:
        return False
    
    a, b = positions[u1], positions[v1]
    c, d = positions[u2], positions[v2]
    
    patterns = [
        (a < c < b < d), (a < d < b < c),
        (c < a < d < b), (c < b < d < a),
        (b < c < a < d), (b < d < a < c),
        (d < a < c < b), (d < b < c < a)
    ]
    
    return any(patterns)

def build_graph_from_json(graph_json_path: str) -> nx.DiGraph:
    """Build graph from JSON file"""
    with open(graph_json_path, "r") as f:
        data = json.load(f)

    G = nx.DiGraph()
    for n in data["nodes"]:
        node_id = str(n["id"])
        parent = n.get("parent")
        parent_id = str(parent) if parent is not None else None
        node_type = "root" if parent_id is None else str(n.get("type", "node"))
        G.add_node(node_id, type=node_type, parent=parent_id)

    for n in data["nodes"]:
        node_id = str(n["id"])
        parent = n.get("parent")
        if parent is not None:
            parent_id = str(parent)
            G.add_edge(parent_id, node_id, type="top")

    for e in data["edges"]:
        source = str(e["source"])
        target = str(e["target"])
        G.add_edge(source, target, type="bottom")
    
    return G

