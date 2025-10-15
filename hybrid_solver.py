import gurobipy as gp
import networkx as nx
import json
from itertools import combinations, permutations
from gurobipy import GRB
import time
from typing import List, Set, Dict, Tuple
import os
import traceback

def solve_layout_for_graph_hybrid(graph_json_path: str, time_limit: int = 300) -> List[str]:
    """
    LEAF-ONLY OPTIMIZATION HYBRID: 
    Uses heuristic as base, then optimizes LEAF NODE ordering with Gurobi
    """
    
    print("🚀 LEAF-ONLY OPTIMIZATION HYBRID STARTING...")
    print(f"📁 Input file: {graph_json_path}")
    
    if not os.path.exists(graph_json_path):
        print(f"❌ Error: File not found at {graph_json_path}")
        return []

    try:
        # Load graph data
        with open(graph_json_path, "r") as f:
            data = json.load(f)

        # Build graph exactly like heuristic solver
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

        # Get leaf nodes
        leaf_nodes = set()
        has_children = set()
        for u, v in G.edges():
            if G[u][v]['type'] == 'top':
                has_children.add(u)
        leaf_nodes = set(G.nodes()) - has_children

        # === STEP 1: GET HEURISTIC BASE SOLUTION ===
        print("🔄 Getting heuristic base solution...")
        
        try:
            from heuristic_solver import solve_layout_for_graph_heuristic
            heuristic_layout = solve_layout_for_graph_heuristic(G)
            
            if not heuristic_layout:
                print("❌ Heuristic failed")
                return []
                
            # Verify heuristic has planar top page
            top_edges = [(u, v) for u, v in G.edges() if G[u][v]['type'] == 'top']
            bottom_edges = [(u, v) for u, v in G.edges() if G[u][v]['type'] == 'bottom']
            
            heuristic_top_crossings = calculate_crossings(heuristic_layout, top_edges)
            heuristic_bottom_crossings = calculate_crossings(heuristic_layout, bottom_edges)
            
            print(f"✅ Heuristic base: {heuristic_bottom_crossings} bottom crossings, {heuristic_top_crossings} top crossings")
            
            if heuristic_top_crossings > 0:
                print("❌ Heuristic has top crossings - cannot optimize")
                return [node for node in heuristic_layout if node in leaf_nodes]
                
        except Exception as e:
            print(f"❌ Heuristic error: {e}")
            return []

        # === STEP 2: OPTIMIZE LEAF NODE ORDERING ===
        print("🔄 Starting LEAF NODE optimization...")
        
        # Identify sibling groups that contain LEAF NODES
        leaf_sibling_groups = {}
        for node in G.nodes():
            children = [v for u, v in G.edges(node) if G[u][v]['type'] == 'top']
            leaf_children = [child for child in children if child in leaf_nodes]
            if len(leaf_children) > 1:  # Only groups with multiple leaves
                leaf_sibling_groups[node] = leaf_children
        
        print(f"🔍 Found {len(leaf_sibling_groups)} leaf sibling groups: {leaf_sibling_groups}")
        
        if not leaf_sibling_groups:
            print("⚠️ No leaf sibling groups to optimize")
            return [node for node in heuristic_layout if node in leaf_nodes]

        # Create a copy to work with
        optimized_layout = heuristic_layout.copy()
        current_positions = {node: idx for idx, node in enumerate(optimized_layout)}
        bottom_edges = [(u, v) for u, v in G.edges() if G[u][v]['type'] == 'bottom']
        
        total_improvement = 0
        
        # Optimize each LEAF sibling group independently
        for parent, leaf_siblings in leaf_sibling_groups.items():
            improvement = optimize_leaf_sibling_group(G, optimized_layout, current_positions, parent, leaf_siblings, bottom_edges)
            total_improvement += improvement
            # Update positions after each optimization
            current_positions = {node: idx for idx, node in enumerate(optimized_layout)}
        
        # Calculate final crossings
        final_top_crossings = calculate_crossings(optimized_layout, top_edges)
        final_bottom_crossings = calculate_crossings(optimized_layout, bottom_edges)
        
        print(f"📊 OPTIMIZATION RESULTS:")
        print(f"   Initial: {heuristic_bottom_crossings} bottom crossings")
        print(f"   Final:   {final_bottom_crossings} bottom crossings") 
        print(f"   Improvement: {heuristic_bottom_crossings - final_bottom_crossings} crossings")
        print(f"   Top crossings: {final_top_crossings} (must be 0)")
        
        if final_top_crossings == 0 and final_bottom_crossings < heuristic_bottom_crossings:
            print("✅ SUCCESS: Leaf optimization improved solution!")
        else:
            print("ℹ️  Using heuristic solution (no improvement or top crossings)")
            # Fallback to original heuristic if no improvement
            optimized_layout = heuristic_layout
        
        return [node for node in optimized_layout if node in leaf_nodes]

    except Exception as e:
        print(f"❌ Hybrid solver error: {e}")
        traceback.print_exc()
        return []

def add_complete_crossing_constraint(m, cross_var, u1, v1, u2, v2, order_vars, leaf_siblings):
    """COMPLETE crossing constraint with all 8 patterns"""
    
    # Only proceed if at least 2 nodes are in our leaf sibling group
    nodes = [u1, v1, u2, v2]
    relevant_nodes = [node for node in nodes if node in leaf_siblings]
    if len(relevant_nodes) < 2:
        return
    
    # All 8 crossing patterns
    patterns = [
        # Pattern 1: u1 < u2 < v1 < v2
        [f"order_{u1}_{u2}", f"order_{u2}_{v1}", f"order_{v1}_{v2}"],
        # Pattern 2: u1 < v2 < v1 < u2
        [f"order_{u1}_{v2}", f"order_{v2}_{v1}", f"order_{v1}_{u2}"],
        # Pattern 3: u2 < u1 < v2 < v1  
        [f"order_{u2}_{u1}", f"order_{u1}_{v2}", f"order_{v2}_{v1}"],
        # Pattern 4: u2 < v1 < v2 < u1
        [f"order_{u2}_{v1}", f"order_{v1}_{v2}", f"order_{v2}_{u1}"],
        # Pattern 5: v1 < u2 < u1 < v2
        [f"order_{v1}_{u2}", f"order_{u2}_{u1}", f"order_{u1}_{v2}"],
        # Pattern 6: v1 < v2 < u1 < u2  
        [f"order_{v1}_{v2}", f"order_{v2}_{u1}", f"order_{u1}_{u2}"],
        # Pattern 7: v2 < u1 < u2 < v1
        [f"order_{v2}_{u1}", f"order_{u1}_{u2}", f"order_{u2}_{v1}"],
        # Pattern 8: v2 < v1 < u2 < u1
        [f"order_{v2}_{v1}", f"order_{v1}_{u2}", f"order_{u2}_{u1}"]
    ]
    
    # Add constraints for each crossing pattern
    for pattern in patterns:
        # Only add constraint if all variables exist
        if all(var in order_vars for var in pattern):
            m.addConstr(gp.quicksum([order_vars[var] for var in pattern]) <= len(pattern) - 1 + cross_var)

def optimize_leaf_sibling_group(G, layout, positions, parent, leaf_siblings, bottom_edges):
    """
    Optimize leaf node ordering using COMPLETE crossing minimization
    """
    
    # Get position range
    sibling_positions = [positions[s] for s in leaf_siblings]
    start_pos = min(sibling_positions)
    end_pos = max(sibling_positions)
    
    current_block = layout[start_pos:end_pos+1]
    current_leaf_order = [node for node in current_block if node in leaf_siblings]
    
    if len(current_leaf_order) <= 1:
        return 0
    
    print(f"   🔍 Optimizing {parent}: {leaf_siblings}")
    print(f"      Current order: {current_leaf_order}")
    
    try:
        m = gp.Model(f"leaf_opt_{parent}")
        m.Params.OutputFlag = 0
        m.Params.TimeLimit = 60
        
        # Create ordering variables for all leaf pairs
        order_vars = {}
        for u, v in combinations(leaf_siblings, 2):
            order_vars[f"order_{u}_{v}"] = m.addVar(vtype=GRB.BINARY, name=f"order_{u}_{v}")
            order_vars[f"order_{v}_{u}"] = m.addVar(vtype=GRB.BINARY, name=f"order_{v}_{u}")
            m.addConstr(order_vars[f"order_{u}_{v}"] + order_vars[f"order_{v}_{u}"] == 1)
        
        # Add transitivity constraints
        for u, v, w in combinations(leaf_siblings, 3):
            m.addConstr(order_vars[f"order_{u}_{v}"] + order_vars[f"order_{v}_{w}"] <= order_vars[f"order_{u}_{w}"] + 1)
            m.addConstr(order_vars[f"order_{u}_{w}"] + order_vars[f"order_{w}_{v}"] <= order_vars[f"order_{u}_{v}"] + 1)
            m.addConstr(order_vars[f"order_{v}_{u}"] + order_vars[f"order_{u}_{w}"] <= order_vars[f"order_{v}_{w}"] + 1)
        
        # Objective: minimize crossings
        crossing_obj = gp.LinExpr()
        
        # Consider ALL bottom edges that could be affected by reordering these leaves
        affected_edges = []
        for u, v in bottom_edges:
            if u in leaf_siblings or v in leaf_siblings:
                affected_edges.append((u, v))
        
        print(f"      Considering {len(affected_edges)} affected edges")
        
        # Create crossing variables for edge pairs
        crossing_vars = {}
        edge_pairs_created = 0
        
        for (u1, v1), (u2, v2) in combinations(affected_edges, 2):
            # Only create crossing variable if both edges share at least one leaf from our group
            edge1_leaves = [u1, v1]
            edge2_leaves = [u2, v2]
            
            common_leaves = set(edge1_leaves) & set(leaf_siblings) | set(edge2_leaves) & set(leaf_siblings)
            if len(common_leaves) >= 2:
                key = f"cross_{u1}_{v1}_{u2}_{v2}"
                crossing_vars[key] = m.addVar(vtype=GRB.BINARY, name=key)
                add_complete_crossing_constraint(m, crossing_vars[key], u1, v1, u2, v2, order_vars, leaf_siblings)
                crossing_obj.add(crossing_vars[key])
                edge_pairs_created += 1
        
        print(f"      Created {edge_pairs_created} crossing variables")
        
        if edge_pairs_created == 0:
            print(f"      ⚠️ No optimizable edge pairs for {parent}")
            return 0
        
        # Warm start from current order
        for u, v in combinations(leaf_siblings, 2):
            if positions[u] < positions[v]:
                order_vars[f"order_{u}_{v}"].Start = 1
                order_vars[f"order_{v}_{u}"].Start = 0
            else:
                order_vars[f"order_{u}_{v}"].Start = 0
                order_vars[f"order_{v}_{u}"].Start = 1
        
        m.setObjective(crossing_obj, GRB.MINIMIZE)
        m.optimize()
        
        if m.status in [GRB.OPTIMAL, GRB.TIME_LIMIT] and m.SolCount > 0:
            # Extract optimized order
            optimized_leaf_order = leaf_siblings.copy()
            
            # Sort based on Gurobi solution
            def get_gurobi_position(node):
                score = 0
                for other in leaf_siblings:
                    if node != other:
                        if f"order_{node}_{other}" in order_vars and order_vars[f"order_{node}_{other}"].X > 0.5:
                            score += 1
                return score
            
            optimized_leaf_order.sort(key=get_gurobi_position, reverse=True)
            
            print(f"      Optimized order: {optimized_leaf_order}")
            
            # Apply the new order and check improvement
            if optimized_leaf_order != current_leaf_order:
                new_block = []
                leaf_iter = iter(optimized_leaf_order)
                
                for node in current_block:
                    if node in leaf_siblings:
                        new_block.append(next(leaf_iter))
                    else:
                        new_block.append(node)
                
                layout[start_pos:end_pos+1] = new_block
                
                # Verify no top crossings introduced
                top_edges = [(u, v) for u, v in G.edges() if G[u][v]['type'] == 'top']
                new_top_crossings = calculate_crossings(layout, top_edges)
                
                if new_top_crossings == 0:
                    old_crossings = calculate_local_crossings(layout, bottom_edges, start_pos, end_pos)
                    # Recalculate with the original block to get accurate comparison
                    original_layout = layout.copy()
                    layout[start_pos:end_pos+1] = current_block
                    current_crossings = calculate_local_crossings(layout, bottom_edges, start_pos, end_pos)
                    layout[start_pos:end_pos+1] = new_block
                    new_crossings = calculate_local_crossings(layout, bottom_edges, start_pos, end_pos)
                    
                    improvement = current_crossings - new_crossings
                    if improvement > 0:
                        print(f"      ✅ Improved by {improvement} crossings!")
                        return improvement
                    else:
                        layout[start_pos:end_pos+1] = current_block
                        print(f"      ⚠️ No improvement ({current_crossings} → {new_crossings})")
                else:
                    layout[start_pos:end_pos+1] = current_block
                    print(f"      ❌ Would introduce top crossings")
        
        return 0
        
    except Exception as e:
        print(f"      ❌ Optimization failed: {e}")
        return 0


def add_leaf_crossing_constraint(m, cross_var, u1, v1, u2, v2, order_vars, leaf_siblings, positions):
    """PROPER crossing constraint for edges between leaf nodes"""
    
    # Only consider edges where at least one endpoint is in our leaf sibling group
    relevant_nodes = [u1, v1, u2, v2]
    relevant_leaves = [node for node in relevant_nodes if node in leaf_siblings]
    
    if len(relevant_leaves) < 2:
        return  # Not enough leaves from this group
    
    # Get all four positions in the current order
    all_nodes = [u1, v1, u2, v2]
    
    # Create a proper crossing constraint
    # Two edges (u1,v1) and (u2,v2) cross if their endpoints are interleaved
    # There are 8 possible crossing patterns
    
    # Pattern 1: u1 < u2 < v1 < v2
    m.addConstr(
        order_vars.get(f"order_{u1}_{u2}", 0) + 
        order_vars.get(f"order_{u2}_{v1}", 0) + 
        order_vars.get(f"order_{v1}_{v2}", 0) <= 2 + cross_var
    )
    
    # Pattern 2: u1 < v2 < v1 < u2  
    m.addConstr(
        order_vars.get(f"order_{u1}_{v2}", 0) + 
        order_vars.get(f"order_{v2}_{v1}", 0) + 
        order_vars.get(f"order_{v1}_{u2}", 0) <= 2 + cross_var
    )
    # Pattern 3: u2 < u1 < v2 < v1
    m.addConstr(
        order_vars.get(f"order_{u2}_{u1}", 0) + 
        order_vars.get(f"order_{u1}_{v2}", 0) + 
        order_vars.get(f"order_{v2}_{v1}", 0) <= 2 + cross_var
    )   
    # Pattern 4: u2 < v1 < v2 < u1
    m.addConstr( 
        order_vars.get(f"order_{u2}_{v1}", 0) + 
        order_vars.get(f"order_{v1}_{v2}", 0) + 
        order_vars.get(f"order_{v2}_{u1}", 0) <= 2 + cross_var
    )
    # Pattern 5: v1 < u2 < u1 < v2
    m.addConstr(
        order_vars.get(f"order_{v1}_{u2}", 0) + 
        order_vars.get(f"order_{u2}_{u1}", 0) + 
        order_vars.get(f"order_{u1}_{v2}", 0) <= 2 + cross_var
    )
    # Pattern 6: v1 < v2 < u1 < u2
    m.addConstr(
        order_vars.get(f"order_{v1}_{v2}", 0) + 
        order_vars.get(f"order_{v2}_{u1}", 0) + 
        order_vars.get(f"order_{u1}_{u2}", 0) <= 2 + cross_var
    )
    # Pattern 7: v2 < u1 < u2 < v1
    m.addConstr(
        order_vars.get(f"order_{v2}_{u1}", 0) + 
        order_vars.get(f"order_{u1}_{u2}", 0) + 
        order_vars.get(f"order_{u2}_{v1}", 0) <= 2 + cross_var
    )
    # Pattern 8: v2 < v1 < u2 < u1
    m.addConstr(
        order_vars.get(f"order_{v2}_{v1}", 0) + 
        order_vars.get(f"order_{v1}_{u2}", 0) + 
        order_vars.get(f"order_{u2}_{u1}", 0) <= 2 + cross_var
    )
        
        
        
        
def generate_crossing_patterns(u1, v1, u2, v2, leaf_siblings):
    """Generate ordering patterns that cause crossings"""
    patterns = []
    leaves = [u1, v1, u2, v2]
    leaves = [l for l in leaves if l in leaf_siblings]
    leaves = list(set(leaves))
    
    if len(leaves) < 2:
        return patterns
    
    # Generate simple crossing patterns
    for perm in permutations(leaves, 2):
        a, b = perm
        patterns.append([f"order_{a}_{b}"])
    
    return patterns

def build_order_from_pairs(nodes, pairs):
    """Build a total order from pairwise ordering constraints"""
    from collections import defaultdict, deque
    
    graph = defaultdict(list)
    in_degree = defaultdict(int)
    
    for u, v in pairs:
        graph[u].append(v)
        in_degree[v] += 1
        if u not in in_degree:
            in_degree[u] = 0
    
    # Topological sort
    queue = deque([node for node in nodes if in_degree[node] == 0])
    order = []
    
    while queue:
        node = queue.popleft()
        order.append(node)
        for neighbor in graph[node]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)
    
    # Add any remaining nodes
    for node in nodes:
        if node not in order:
            order.append(node)
    
    return order

def calculate_local_crossings(layout, edges, start_pos, end_pos):
    """Calculate crossings only in the local region"""
    local_positions = {node: idx for idx, node in enumerate(layout[start_pos:end_pos+1], start_pos)}
    crossings = 0
    
    for i, (u1, v1) in enumerate(edges):
        if u1 not in local_positions or v1 not in local_positions:
            continue
            
        for j, (u2, v2) in enumerate(edges):
            if i >= j or u2 not in local_positions or v2 not in local_positions:
                continue
                
            u1_pos, v1_pos = local_positions[u1], local_positions[v1]
            u2_pos, v2_pos = local_positions[u2], local_positions[v2]
            
            if (u1_pos < u2_pos < v1_pos < v2_pos) or \
               (u1_pos < v2_pos < v1_pos < u2_pos) or \
               (u2_pos < u1_pos < v2_pos < v1_pos) or \
               (u2_pos < v1_pos < v2_pos < u1_pos) or \
               (v1_pos < u2_pos < u1_pos < v2_pos) or \
               (v1_pos < v2_pos < u1_pos < u2_pos) or \
               (v2_pos < u1_pos < u2_pos < v1_pos) or \
               (v2_pos < v1_pos < u2_pos < u1_pos):
                crossings += 1
    
    return crossings

def calculate_crossings(layout: List[str], edges: List[Tuple[str, str]]) -> int:
    """Calculate number of crossings in a layout"""
    crossings = 0
    pos = {node: idx for idx, node in enumerate(layout)}
    
    for i, (u1, v1) in enumerate(edges):
        if u1 not in pos or v1 not in pos:
            continue
        u1_pos, v1_pos = pos[u1], pos[v1]
        
        for j, (u2, v2) in enumerate(edges):
            if i >= j or u2 not in pos or v2 not in pos:
                continue
            u2_pos, v2_pos = pos[u2], pos[v2]
            
            if (u1_pos < u2_pos < v1_pos < v2_pos) or \
               (u1_pos < v2_pos < v1_pos < u2_pos) or \
               (u2_pos < u1_pos < v2_pos < v1_pos) or \
               (u2_pos < v1_pos < v2_pos < u1_pos) or \
               (v1_pos < u2_pos < u1_pos < v2_pos) or \
               (v1_pos < v2_pos < u1_pos < u2_pos) or \
               (v2_pos < u1_pos < u2_pos < v1_pos) or \
               (v2_pos < v1_pos < u2_pos < u1_pos):
                crossings += 1
    
    return crossings