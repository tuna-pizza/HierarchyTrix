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
        # Load data
        with open(graph_json_path, "r") as f:
            data = json.load(f)

        print(f"DEBUG: Loaded {len(data['nodes'])} nodes, {len(data['edges'])} edges from {graph_json_path}")

        # Build graph
        G = nx.DiGraph()
        for n in data["nodes"]:
            raw_parent = n.get("parent")
            parent_val = None if raw_parent is None or str(raw_parent) == 'None' or str(raw_parent) == '' else str(raw_parent)
            node_type = "root" if parent_val is None else str(n.get("type", "node"))
            G.add_node(str(n["id"]), type=node_type, parent=parent_val)

        for n in data["nodes"]:
            if str(n["parent"]) != 'None':
                G.add_edge(str(n["parent"]), str(n["id"]), source=str(n["parent"]), target=str(n["id"]), type="top")

        for e in data["edges"]:
            G.add_edge(str(e["source"]), str(e["target"]), source=str(e["source"]), target=str(e["target"]), type="bottom")

        nodes = list(G.nodes())
        edges = list(G.edges())

        # Identify leaf nodes
        leaf_nodes: Set[str] = set()
        has_children: Set[str] = set()
        for u, v in G.edges():
            if G[u][v]['type'] == 'top':  # u is parent of v
                has_children.add(u)
        leaf_nodes = set(nodes) - has_children
        print(f"DEBUG: {len(leaf_nodes)} leaf nodes identified: {sorted(leaf_nodes)}")

        start_time = time.time()

        # Setup Gurobi model
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

        m.Params.TimeLimit = time_limit
        m.Params.Method = 2
        m.Params.Threads = min(4, os.cpu_count() or 1)
        m.Params.MIPGap = 1e-4
        m.Params.Presolve = 2

        print(f"DEBUG: Creating ILP model with {len(nodes)} nodes...")

        # VARIABLES
        x_nodes = {}
        x_edges = {}

        def getKey(u, v):
            return f"node *{u}* before *{v}*"

        for u, v in combinations(nodes, 2):
            x_nodes[getKey(u, v)] = m.addVar(vtype=GRB.BINARY, name=getKey(u, v))  
            x_nodes[getKey(v, u)] = m.addVar(vtype=GRB.BINARY, name=getKey(v, u))  

        def getEdgeKey(e1, e2):
            return f"edges *{e1[0]}* *{e1[1]}* and *{e2[0]}* *{e2[1]}* cross"

        for e1, e2 in combinations(edges, 2):
            x_edges[getEdgeKey(e1, e2)] = m.addVar(vtype=GRB.BINARY, name=getEdgeKey(e1, e2))

        # CONSTRAINTS
        print("DEBUG: Adding ordering constraints...")
        for u, v in combinations(nodes, 2):
            m.addConstr(x_nodes[getKey(u, v)] + x_nodes[getKey(v, u)] == 1, 
                       name=f"node_pair_{u}_{v}")

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

        print("DEBUG: Adding crossing constraints...")
        def getEdgeFromKey(key, edges_dict):
            tmp = key.split("*")
            e1S = tmp[1]
            e1T = tmp[3]
            e2S = tmp[5]
            e2T = tmp[7]
            return (e1S, e1T), (e2S, e2T)

        def addCrossingConstr(m, x_edge, e1, e2, x_nodes): 
            a, b = e1
            c, d = e2
            if a != c and a != d and b != c and b != d:
                m.addConstr(x_nodes[getKey(a, c)] + x_nodes[getKey(c, b)] + x_nodes[getKey(b, d)] <= 2 + x_edge, name=f"crossing_1_{a}_{b}_{c}_{d}")
                m.addConstr(x_nodes[getKey(b, c)] + x_nodes[getKey(c, a)] + x_nodes[getKey(a, d)] <= 2 + x_edge, name=f"crossing_2_{a}_{b}_{c}_{d}")
                m.addConstr(x_nodes[getKey(a, d)] + x_nodes[getKey(d, b)] + x_nodes[getKey(b, c)] <= 2 + x_edge, name=f"crossing_3_{a}_{b}_{c}_{d}")
                m.addConstr(x_nodes[getKey(b, d)] + x_nodes[getKey(d, a)] + x_nodes[getKey(a, c)] <= 2 + x_edge, name=f"crossing_4_{a}_{b}_{c}_{d}")
                m.addConstr(x_nodes[getKey(c, a)] + x_nodes[getKey(a, d)] + x_nodes[getKey(d, b)] <= 2 + x_edge, name=f"crossing_5_{a}_{b}_{c}_{d}")
                m.addConstr(x_nodes[getKey(c, b)] + x_nodes[getKey(b, d)] + x_nodes[getKey(d, a)] <= 2 + x_edge, name=f"crossing_6_{a}_{b}_{c}_{d}")
                m.addConstr(x_nodes[getKey(d, a)] + x_nodes[getKey(a, c)] + x_nodes[getKey(c, b)] <= 2 + x_edge, name=f"crossing_7_{a}_{b}_{c}_{d}")
                m.addConstr(x_nodes[getKey(d, b)] + x_nodes[getKey(b, c)] + x_nodes[getKey(c, a)] <= 2 + x_edge, name=f"crossing_8_{a}_{b}_{c}_{d}")
                return 8
            return 0

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

        # OBJECTIVE: Minimize bottom edge crossings
        print("DEBUG: Setting objective...")
        obj = gp.LinExpr()
        for key in list(x_edges.keys()):
            e1, e2 = getEdgeFromKey(key, edges)
            e1Data = G.get_edge_data(e1[0], e1[1])
            e2Data = G.get_edge_data(e2[0], e2[1])
            if e1Data["type"] == "bottom" and e2Data["type"] == "bottom":
                obj.add(x_edges[key])
        m.setObjective(obj, GRB.MINIMIZE)

        # SOLVE
        print("DEBUG: Starting optimization...")
        m.optimize()

        solving_time = time.time() - start_time
        time_str = f"{solving_time:.2f} seconds" if solving_time < 60 else f"{solving_time/60:.2f} minutes" if solving_time < 3600 else f"{solving_time/3600:.2f} hours"

        instance_name = os.path.basename(graph_json_path).replace(".json", "")
        print(f"\n=== SOLVER SUMMARY for {instance_name} ===")
        status_str = "Optimal" if m.status == GRB.OPTIMAL else "Time limit reached" if m.status == GRB.TIME_LIMIT else "Infeasible" if m.status == GRB.INFEASIBLE else f"Status: {m.status}"
        print(f"Total solving time: {time_str}")
        print(f"Model status: {status_str}")

        # EXTRACT SOLUTION
        if m.status in [GRB.OPTIMAL, GRB.TIME_LIMIT] and m.SolCount > 0:
            GD = nx.DiGraph()
            for v in m.getVars():
                tmp = v.varName
                if v.X > 0.95 and tmp.startswith('node'):
                    v1 = tmp.split("*")[1]
                    v2 = tmp.split("*")[3]
                    GD.add_edge(v1, v2)

            if nx.is_directed_acyclic_graph(GD):
                full_order = list(nx.topological_sort(GD))
                leaf_order = [node for node in full_order if node in leaf_nodes]
                print(f"✅ Linear layout order found with {len(leaf_order)} leaf nodes")
                print(f"Full order: {full_order}")
                print(f"Leaf order: {leaf_order}")
                return leaf_order
            else:
                print(" Solution graph has cycles - invalid ordering")
                return []
        else:
            print(" No feasible solution found")
            return []

    except Exception as e:
        print(f" Unexpected error: {e}")
        traceback.print_exc()
        return []
