import gurobipy as gp
import networkx as nx
import json
from itertools import combinations
from gurobipy import GRB
import time
from typing import List, Set, Dict, Tuple
import os
import traceback

# ⚠️ IMPORTANT: Keep the original function name that the server expects
def solve_layout_for_graph(graph_json_path: str, time_limit: int = 3600) -> List[str]:
    """
    ILP solver for minimum edge crossings - uses the original function name
    that the Flask server expects.
    """
    
    if not os.path.exists(graph_json_path):
        print(f"Error: File not found at {graph_json_path}")
        return []
    
    try:
        ### Load and parse data - KEEPING YOUR PREFERRED STRUCTURE
        with open(graph_json_path, "r") as f:
            data = json.load(f)

        print(f"DEBUG: Loaded {len(data['nodes'])} nodes, {len(data['edges'])} edges from {graph_json_path}")

        # Build graph structure - SIMILAR TO FIRST CODE
        G = nx.DiGraph()
        
        # Add nodes - LIKE FIRST CODE
        for n in data["nodes"]:
            if str(n["parent"]) != 'None':
                G.add_node(str(n["id"]), type=str(n["type"]))
            else:        
                G.add_node(str(n["id"]), type="root")

        # Add hierarchy edges - LIKE FIRST CODE
        for n in data["nodes"]:
            if str(n["parent"]) != 'None':
                G.add_edge(str(n["parent"]), str(n["id"]), source=str(n["parent"]), target=str(n["id"]), type="top")

        # Add leaf-level edges - LIKE FIRST CODE
        for e in data["edges"]:
            G.add_edge(str(e["source"]), str(e["target"]), source=str(e["source"]), target=str(e["target"]), type="bottom")

        nodes = list(G.nodes())
        edges = list(G.edges())
        
        # Identify leaf nodes for final output - KEEPING YOUR PREFERRED FEATURE
        leaf_nodes: Set[str] = set()
        has_children: Set[str] = set()
        
        for u, v in G.edges():
            if G[u][v]['type'] == 'top':  # u is parent of v
                has_children.add(u)
        
        leaf_nodes = set(nodes) - has_children
        print(f"DEBUG: {len(leaf_nodes)} leaf nodes identified: {sorted(leaf_nodes)}")

        # Start timing - KEEPING YOUR PREFERRED FEATURE
        start_time = time.time()

        # Setup Gurobi model - KEEPING YOUR PREFERRED SETTINGS
        try:
            env = gp.Env(empty=True)
            env.setParam('OutputFlag', 1)
            env.setParam('LogToConsole', 1)
            env.start()
            m = gp.Model("nodetrix_improved", env=env)
        except:
            print("DEBUG: Using default Gurobi environment")
            m = gp.Model("nodetrix_improved")
            m.Params.OutputFlag = 1

        # Set optimization parameters - KEEPING YOUR PREFERRED SETTINGS
        m.Params.TimeLimit = time_limit
        m.Params.Method = 2
        m.Params.Threads = min(4, os.cpu_count() or 1)
        m.Params.MIPGap = 1e-4
        m.Params.Presolve = 2

        print(f"DEBUG: Creating ILP model with {len(nodes)} nodes...")

        # VARIABLES - USING EXACT APPROACH FROM FIRST CODE
        x_nodes = {}   # variables for pairs of nodes 
        x_edges = {}   # variables for crossing

        # EXACT SAME VARIABLE CREATION AS FIRST CODE
        def getKey(u, v):
            return f"node *{u}* before *{v}*"

        for u, v in combinations(nodes, 2):
            x_nodes[getKey(u, v)] = m.addVar(vtype=GRB.BINARY, name=getKey(u, v))  
            x_nodes[getKey(v, u)] = m.addVar(vtype=GRB.BINARY, name=getKey(v, u))  
        
        # EXACT SAME EDGE VARIABLE CREATION AS FIRST CODE
        def getEdgeKey(e1, e2):
            return f"edges *{e1[0]}* *{e1[1]}* and *{e2[0]}* *{e2[1]}* cross"

        for e1, e2 in combinations(edges, 2):
            x_edges[getEdgeKey(e1, e2)] = m.addVar(vtype=GRB.BINARY, name=getEdgeKey(e1, e2))

        # CONSTRAINTS - EXACT SAME AS FIRST CODE

        # CONSTRAINT 1: Ordering consistency - EXACT SAME
        print("DEBUG: Adding ordering constraints...")
        for u, v in combinations(nodes, 2):
            m.addConstr(x_nodes[getKey(u, v)] + x_nodes[getKey(v, u)] == 1, 
                       name=f"node_pair_{u}_{v}")

        # CONSTRAINT 2: Tree hierarchy constraints - EXACT SAME
        print("DEBUG: Adding tree constraints...")
        tree_constraints = 0
        for u, v in combinations(nodes, 2):
            if G.has_edge(u, v):
                eData = G.get_edge_data(u, v)
                if eData["source"] == str(u) and eData["target"] == str(v) and eData["type"] == "top":
                    m.addConstr(x_nodes[getKey(u, v)] == 1, name=f"node_fixed_{u}_{v}")
                    tree_constraints += 1
            if G.has_edge(v, u):
                eData = G.get_edge_data(v, u)
                if eData["source"] == str(v) and eData["target"] == str(u) and eData["type"] == "top":
                    m.addConstr(x_nodes[getKey(v, u)] == 1, name=f"node_fixed_{v}_{u}")
                    tree_constraints += 1
        print(f"DEBUG: Added {tree_constraints} tree constraints")

        # CONSTRAINT 3: Transitivity - EXACT SAME AS FIRST CODE
        print("DEBUG: Adding transitivity constraints...")
        
        def addTransitivityConstr(m, a, b, c, x_nodes):
            keyAB = getKey(a, b)
            keyBC = getKey(b, c)
            keyAC = getKey(a, c)
            m.addConstr(x_nodes[keyAB] + x_nodes[keyBC] <= x_nodes[keyAC] + 1, 
                       name=f"trans_{a}_{b}_{c}")
        
        transitivity_constraints = 0
        for a, b, c in combinations(nodes, 3):
            addTransitivityConstr(m, a, b, c, x_nodes)
            addTransitivityConstr(m, a, c, b, x_nodes)
            addTransitivityConstr(m, b, a, c, x_nodes)
            addTransitivityConstr(m, b, c, a, x_nodes)
            addTransitivityConstr(m, c, a, b, x_nodes)
            addTransitivityConstr(m, c, b, a, x_nodes)
            transitivity_constraints += 6
        print(f"DEBUG: Added {transitivity_constraints} transitivity constraints")

        # CONSTRAINT 4: Crossing detection - EXACT SAME AS FIRST CODE
        print("DEBUG: Adding crossing constraints...")

        def getEdgeFromKey(key, edges_dict):
            tmp = key.split("*")
            e1S = tmp[1]
            e1T = tmp[3]
            e2S = tmp[5]
            e2T = tmp[7]
            return (e1S, e1T), (e2S, e2T)

        def addCrossingConstr(m, x_edge, e1, e2, x_nodes): 
            # EXACT SAME 8 CONSTRAINT PATTERNS FROM FIRST CODE
            a = e1[0]
            b = e1[1]
            c = e2[0]
            d = e2[1]

            if a != c and a != d and b != c and b != d:
                m.addConstr(x_nodes[getKey(a, c)] + x_nodes[getKey(c, b)] + x_nodes[getKey(b, d)] <= 2 + x_edge, 
                           name=f"crossing_1_{a}_{b}_{c}_{d}")
                m.addConstr(x_nodes[getKey(b, c)] + x_nodes[getKey(c, a)] + x_nodes[getKey(a, d)] <= 2 + x_edge, 
                           name=f"crossing_2_{a}_{b}_{c}_{d}")
                m.addConstr(x_nodes[getKey(a, d)] + x_nodes[getKey(d, b)] + x_nodes[getKey(b, c)] <= 2 + x_edge, 
                           name=f"crossing_3_{a}_{b}_{c}_{d}")
                m.addConstr(x_nodes[getKey(b, d)] + x_nodes[getKey(d, a)] + x_nodes[getKey(a, c)] <= 2 + x_edge, 
                           name=f"crossing_4_{a}_{b}_{c}_{d}")

                m.addConstr(x_nodes[getKey(c, a)] + x_nodes[getKey(a, d)] + x_nodes[getKey(d, b)] <= 2 + x_edge, 
                           name=f"crossing_5_{a}_{b}_{c}_{d}")
                m.addConstr(x_nodes[getKey(c, b)] + x_nodes[getKey(b, d)] + x_nodes[getKey(d, a)] <= 2 + x_edge, 
                           name=f"crossing_6_{a}_{b}_{c}_{d}")
                m.addConstr(x_nodes[getKey(d, a)] + x_nodes[getKey(a, c)] + x_nodes[getKey(c, b)] <= 2 + x_edge, 
                           name=f"crossing_7_{a}_{b}_{c}_{d}")
                m.addConstr(x_nodes[getKey(d, b)] + x_nodes[getKey(b, c)] + x_nodes[getKey(c, a)] <= 2 + x_edge, 
                           name=f"crossing_8_{a}_{b}_{c}_{d}")
                return 8
            return 0

        # Add crossing constraints - EXACT SAME LOGIC AS FIRST CODE
        crossing_constraints = 0
        for key in list(x_edges.keys()):
            e1, e2 = getEdgeFromKey(key, edges)
            e1Data = G.get_edge_data(e1[0], e1[1])
            e2Data = G.get_edge_data(e2[0], e2[1])
            
            if e1Data["type"] == e2Data["type"]:
                crossing_constraints += addCrossingConstr(m, x_edges[key], e1, e2, x_nodes)
            if e1Data["type"] == "top" and e2Data["type"] == "top":
                m.addConstr(x_edges[key] == 0, name=f"zero_{key}")

        print(f"DEBUG: Added {crossing_constraints} crossing constraints")

        # OBJECTIVE: Minimize bottom edge crossings - EXACT SAME AS FIRST CODE
        print("DEBUG: Setting objective...")
        obj = gp.LinExpr()
        
        for key in list(x_edges.keys()):
            e1, e2 = getEdgeFromKey(key, edges)
            e1Data = G.get_edge_data(e1[0], e1[1])
            e2Data = G.get_edge_data(e2[0], e2[1])
            
            if e1Data["type"] == "bottom" and e2Data["type"] == "bottom":
                obj.add(x_edges[key])
                
        m.setObjective(obj, GRB.MINIMIZE)

        # SOLVE - KEEPING YOUR PREFERRED OUTPUT FORMAT
        print("DEBUG: Starting optimization...")
        m.optimize()

        # RESULTS - KEEPING YOUR PREFERRED OUTPUT FORMAT
        solving_time = time.time() - start_time
        
        if solving_time < 60:
            time_str = f"{solving_time:.2f} seconds"
        elif solving_time < 3600:
            minutes = solving_time / 60
            time_str = f"{minutes:.2f} minutes"
        else:
            hours = solving_time / 3600
            time_str = f"{hours:.2f} hours"

        instance_name = os.path.basename(graph_json_path).replace(".json", "")
        
        print(f"\n=== SOLVER SUMMARY for {instance_name} ===")

        # Calculate number of crossings - EXACT SAME AS FIRST CODE
        num_crossings = 0
        for key in x_edges:
            e1, e2 = getEdgeFromKey(key, edges)
            e1Data = G.get_edge_data(e1[0], e1[1])
            e2Data = G.get_edge_data(e2[0], e2[1])
            if e1Data["type"] == "bottom" and e2Data["type"] == "bottom":
                var = m.getVarByName(key)
                if var.X > 0.5:
                    num_crossings += 1

        if m.status == GRB.OPTIMAL:
            status_str = "Optimal"
            print(f"🎯 Optimal number of bottom-level edge crossings: {num_crossings}")
        else:
            if m.status == GRB.TIME_LIMIT:
                status_str = "Time limit reached"
                if m.SolCount > 0:
                    print(f"⚠️ Best solution found so far: {num_crossings} crossings")
            elif m.status == GRB.INFEASIBLE:
                status_str = "Infeasible"
            else:
                status_str = f"Status: {m.status}"
            
        print(f"Total solving time: {time_str}")
        print(f"Model status: {status_str}")

        # EXTRACT SOLUTION - KEEPING YOUR PREFERRED FEATURE (FILTERING LEAF NODES)
        if m.status in [GRB.OPTIMAL, GRB.TIME_LIMIT] and m.SolCount > 0:
            # Build order graph - EXACT SAME AS FIRST CODE
            GD = nx.DiGraph()
            for v in m.getVars():
                tmp = v.varName
                if v.X > 0.95 and tmp.startswith('node'):
                    v1 = tmp.split("*")[1]
                    v2 = tmp.split("*")[3]
                    GD.add_edge(v1, v2)

            # Compute order - EXACT SAME AS FIRST CODE
            if nx.is_directed_acyclic_graph(GD):
                full_order = list(nx.topological_sort(GD))
                # FILTER TO LEAF NODES ONLY - YOUR PREFERRED FEATURE
                leaf_order = [node for node in full_order if node in leaf_nodes]
                
                print(f"✅ Linear layout order found with {len(leaf_order)} leaf nodes")
                print(f"Full order: {full_order}")
                print(f"Leaf order: {leaf_order}")
                
                return leaf_order
            else:
                print("❌ Solution graph has cycles - invalid ordering")
                cycle = nx.find_cycle(GD, orientation="original")
                print("Cycle:", cycle)
                return []
        else:
            print("❌ No feasible solution found")
            return []

    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        traceback.print_exc()
        return []

# Keep your preferred verification function
def verify_crossings(layout: List[str], edges: List[Tuple[str, str]]) -> int:
    """Verify the number of crossings in a given layout"""
    node_pos = {node: idx for idx, node in enumerate(layout)}
    crossings = 0
    
    for i, (u1, v1) in enumerate(edges):
        pos_u1 = node_pos.get(u1, -1)
        pos_v1 = node_pos.get(v1, -1)
        if pos_u1 == -1 or pos_v1 == -1:
            continue
            
        for j, (u2, v2) in enumerate(edges):
            if i >= j:
                continue
                
            pos_u2 = node_pos.get(u2, -1)
            pos_v2 = node_pos.get(v2, -1)
            if pos_u2 == -1 or pos_v2 == -1:
                continue
            
            if (pos_u1 < pos_u2 < pos_v1 < pos_v2) or \
               (pos_u1 < pos_v2 < pos_v1 < pos_u2) or \
               (pos_v1 < pos_u2 < pos_u1 < pos_v2) or \
               (pos_v1 < pos_v2 < pos_u1 < pos_u2) or \
               (pos_u2 < pos_u1 < pos_v2 < pos_v1) or \
               (pos_u2 < pos_v1 < pos_v2 < pos_u1) or \
               (pos_v2 < pos_u1 < pos_u2 < pos_v1) or \
               (pos_v2 < pos_v1 < pos_u2 < pos_u1):
                crossings += 1
    
    return crossings