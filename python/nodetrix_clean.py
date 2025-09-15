
import gurobipy as gp
import networkx as nx
import json
import matplotlib.pyplot as plt
from itertools import combinations
from typing import List
from gurobipy import GRB

### Import data
# Open and load the JSON file
with open("./data/sample_2.json", "r") as f:
    data = json.load(f)
 
# Setup graph 
G = nx.DiGraph()

# Add nodes
for n in data["nodes"]:
    if str(n["parent"]) != 'None':
        G.add_node(str(n["id"]), type=str(n["type"]))
    else:        
        G.add_node(str(n["id"]), type="root")

# Add hierarchy edges 
for n in data["nodes"]:
    if str(n["parent"]) != 'None':
        G.add_edge(str(n["parent"]), str(n["id"]),  source= str(n["parent"]),   target=str(n["id"]),    type="top")

# Add leaf-level edges
for e in data["edges"]:
    G.add_edge(str(e["source"]), str(e["target"]), source= str(e["source"]),   target=str(e["target"]), type="bottom")


    
nodes = G.nodes()
edges = G.edges()

### Setup ILP 
# general gurobi things
m = gp.Model()
m.Params.OutputFlag = 1 
x_nodes={}   # variables for pairs of nodes 
x_edges={}   # variables for crossing
obj = gp.LinExpr()  # objective 


## variables
# add node pair variables to x_nodes
def getKey(u,v):
    result = "node *"+str(u)+"* before *"+str(v)+"*"
    return result

for u,v in combinations(nodes,2):
    x_nodes[getKey(u,v)] = m.addVar(vtype=GRB.BINARY, name=getKey(u,v))  
    x_nodes[getKey(v,u)] = m.addVar(vtype=GRB.BINARY, name=getKey(v,u))  
   
# add edge pair variables to the x_edges
def getEdgeKey(e1,e2):
    result = "edges *"+str(e1[0])+"* *"+str(e1[1])+"* and *"+str(e2[0])+"* *"+str(e2[1])+"* cross"
    return result

def getEdgeFromKey(key,edges):
    tmp = key.split("*")
    e1S = tmp[1]
    e1T = tmp[3]
    e2S = tmp[5]
    e2T = tmp[7]
    e1 = edges[e1S,e1T]
    e2 = edges[e2S,e2T]
    return e1,e2


for e1,e2 in combinations(edges,2):
    x_edges[getEdgeKey(e1,e2)] = m.addVar(vtype=GRB.BINARY, name=getEdgeKey(e1,e2))
           
## constraints 
# add constraints for x_nodes x[i,j] + x[j,i] == 1, i.e. node i cannot before and after j
for u,v in combinations(nodes,2):
    m.addConstr(x_nodes[getKey(u,v)] + x_nodes[getKey(v,u)] == 1, name=f"node pair "+getKey(u,v)+" "+getKey(v,u))

# add constraints for x_nodes so that parent is always to 
for u,v in combinations(nodes,2):
    if G.has_edge(u,v):
        eData = G.get_edge_data(u,v)
        if eData["source"]==str(u) and eData["target"]== str(v) and eData["type"]=="top":
            m.addConstr(x_nodes[getKey(u,v)]==1, name=f"node fixed "+getKey(u,v))
    if G.has_edge(v,u):
        eData = G.get_edge_data(v,u)
        if eData["source"]== str(v) and eData["target"]== str(u) and eData["type"]=="top":
            m.addConstr(x_nodes[getKey(v,u)]==1, name=f"node fixed "+getKey(v,u))

            
### setting up the transitivity constraints
def addTransitivityConstr(m, a,b,c, x_nodes):
    keyAB = getKey(a,b)
    keyBC = getKey(b,c)
    keyAC = getKey(a,c)
    m.addConstr(x_nodes[keyAB]+x_nodes[keyBC]<=x_nodes[keyAC]+1, name=f"transitivity "+keyAB+"+"+keyBC+"<=1+"+keyAC)
    
for a,b,c in combinations(nodes,3):
    addTransitivityConstr(m, a,b,c, x_nodes)
    addTransitivityConstr(m, a,c,b, x_nodes)
    addTransitivityConstr(m, b,a,c, x_nodes)
    addTransitivityConstr(m, b,c,a, x_nodes)
    addTransitivityConstr(m, c,a,b, x_nodes)
    addTransitivityConstr(m, c,b,a, x_nodes)


### setting up the crossing constraints for two pairs of nodes 
def addCrossingConstr(m, x_edge, e1, e2, x_nodes): 
    # e1 = {a,b} e2 = {c,d}
    a = e1['source']
    b = e1['target']
    c = e2['source']
    d = e2['target']

    if a != c and a!= d and b != c and b != d:
        m.addConstr(x_nodes[getKey(a,c)]+x_nodes[getKey(c,b)]+x_nodes[getKey(b,d)] <= 2 + x_edge, name=f"crossing 1 ")
        m.addConstr(x_nodes[getKey(b,c)]+x_nodes[getKey(c,a)]+x_nodes[getKey(a,d)] <= 2 + x_edge, name=f"crossing 2 ")
        m.addConstr(x_nodes[getKey(a,d)]+x_nodes[getKey(d,b)]+x_nodes[getKey(b,c)] <= 2 + x_edge, name=f"crossing 3 ")
        m.addConstr(x_nodes[getKey(b,d)]+x_nodes[getKey(d,a)]+x_nodes[getKey(a,c)] <= 2 + x_edge, name=f"crossing 4 ")

        m.addConstr(x_nodes[getKey(c,a)]+x_nodes[getKey(a,d)]+x_nodes[getKey(d,b)] <= 2 + x_edge, name=f"crossing 5 ")
        m.addConstr(x_nodes[getKey(c,b)]+x_nodes[getKey(b,d)]+x_nodes[getKey(d,a)] <= 2 + x_edge, name=f"crossing 6 ")
        m.addConstr(x_nodes[getKey(d,a)]+x_nodes[getKey(a,c)]+x_nodes[getKey(c,b)] <= 2 + x_edge, name=f"crossing 7 ")
        m.addConstr(x_nodes[getKey(d,b)]+x_nodes[getKey(b,c)]+x_nodes[getKey(c,a)] <= 2 + x_edge, name=f"crossing 8 ")

    return m 

 

### adding crossing constraints 
for key in list(x_edges.keys()):
    e1Data,e2Data = getEdgeFromKey(key,edges)  
    if e1Data["type"] == e2Data["type"]:
        m = addCrossingConstr(m, x_edges[key], e1Data, e2Data, x_nodes)
    if e1Data["type"] == "top" and e2Data["type"]== "top":
        m.addConstr(x_edges[key] == 0, name=f" variable "+key+" is 0")


### setting up the objective
for key in list(x_edges.keys()):
    e1Data,e2Data = getEdgeFromKey(key,edges)       
    if e1Data["type"] == "bottom" and e2Data["type"] == "bottom":
        obj.add(x_edges[key])      
m.setObjective(obj, GRB.MINIMIZE)

# optimization
m.optimize()



### Evaluation 
# step 1: get linear layout order from gurobi vars 
# build a directed graph
GD = nx.DiGraph() # graph for getting the order 
for v in m.getVars():
    tmp = v.varName
    if v.X > 0.95:
        print(tmp)
        if tmp.startswith('node') and v.X:
            v1 = tmp.split("*")[1]
            v2 = tmp.split("*")[3]
            GD.add_edge(v1,v2)


# compute order if it is a an acyclic graph 
if nx.is_directed_acyclic_graph(GD):
    order = list(nx.topological_sort(GD))
    print(order)
else:
    print("Problem: The order of solution is not valid! ")
    cycle = nx.find_cycle(GD, orientation="original")
    print("Cycle:",cycle)

      

# step 2: visualization 
# compute hierarchy graph without leaf level 
GH = nx.DiGraph() 
for e in G.edges():
    if G.get_edge_data(e[0],e[1])["type"] == "top":
        GH.add_edge(e[0],e[1])
  

# compute layout positions of nodes
def hierarchy_pos(G, root, order):
    pos = {}
    pos[root] = (0,0)

    currentnode = root
    levelinfo={}
    levelinfo[str(root)] = 0
    tmp = G.nodes()
    maxlevel = 0;
    for currentnode in tmp: 
        if levelinfo.get(currentnode) != None:
            for node in tmp: 
                if G.has_edge(currentnode,node):
                    levelinfo[str(node)] =levelinfo.get(currentnode)+1
                    if maxlevel < levelinfo.get(currentnode)+1:
                        maxlevel =  levelinfo.get(currentnode)+1

    for currentnode in tmp:
        if str(currentnode).isdigit():
            levelinfo[str(currentnode)] = maxlevel

    for level in range(maxlevel+1):
        currentx = 1;
        for currentnode in order:
            if levelinfo.get(currentnode) == level:
                pos[str(currentnode)]= ((1/(level+2))*currentx,maxlevel - level)
                currentx = currentx +1
    return pos


# Get node positions
pos = hierarchy_pos(GH, "A", order)

# Draw nodes, lables, and edges
nx.draw_networkx_nodes(GH, pos, node_size=2000, node_color="lightblue")
nx.draw_networkx_labels(GH, pos, font_size=12, font_weight="bold")
nx.draw_networkx_edges(G, pos, connectionstyle="arc3,rad=0.2", arrows=True)

# Display
plt.axis("off")
plt.show()
