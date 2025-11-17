export const NodeType = {
  Cluster: "Cluster",
  Vertex: "Vertex",
};

export class HierarchicallyClusteredGraph {
  constructor() {
    this.nodes = [];
    this.edges = [];
    this.isDirected = false;
  }

  getNumberOfEdges(node1, node2) {
    let myLeaves = node1.getLeaves();
    let otherLeaves = node2.getLeaves();
    let res = 0;
    for (let edge of this.edges) {
      if (
        myLeaves.includes(edge.getSource()) &&
        otherLeaves.includes(edge.getTarget())
      ) {
        res++;
      }
      if (
        otherLeaves.includes(edge.getSource()) &&
        myLeaves.includes(edge.getTarget())
      ) {
        res++;
      }
    }
    return res;
  }

  getEdge(source, target) {
    return this.edges.filter((e) => {
      e.getSource() == source && e.getTarget() == target ? e : null;
    });
  }

  getEdges() {
    return this.edges;
  }

  getNodes() {
    return this.nodes;
  }

  getNodeByID(id) {
    for (let node of this.nodes) {
      if (node.getID() === id) {
        return node;
      }
    }
    return null;
  }

  getVertices() {
    let vertices = [];
    for (let node of this.nodes) {
      if (node.getNodeType() === NodeType.Vertex) {
        vertices.push(node);
      }
    }
    return vertices;
  }

  setIsDirected(directed) {
    this.isDirected = directed;
  }

  getIsDirected() {
    return this.isDirected;
  }

  getClusterLayers(topmost = true) {
    let clusterLayers = [];
    if (topmost) {
      let nextLayer = [];
      for (let cluster of this.getClusters()) {
        if (cluster.getParent() === null) {
          nextLayer.push(cluster);
        }
      }
      while (nextLayer.length > 0) {
        let currentLayer = nextLayer;
        clusterLayers.push(nextLayer);
        nextLayer = [];
        for (let cluster of currentLayer) {
          for (let child of cluster.getChildren()) {
            if (child.getNodeType() === NodeType.Cluster) {
              nextLayer.push(child);
            }
          }
        }
      }
    } else {
      let assigned = [];
      for (let vertex of this.getVertices()) {
        assigned.push(vertex);
      }
      while (assigned.length < this.getNodes().length) {
        let newLayer = [];
        for (let cluster of this.getClusters()) {
          if (!assigned.includes(cluster)) {
            let assignable = true;
            for (let child of cluster.getChildren()) {
              if (!assigned.includes(child)) {
                assignable = false;
              }
            }
            if (assignable) {
              newLayer.push(cluster);
            }
          }
        }
        for (let cluster of newLayer) {
          assigned.push(cluster);
        }
        let newArray = [newLayer];
        clusterLayers = newArray.concat(clusterLayers);
      }
    }
    // console.log(clusterLayers);
    return clusterLayers;
  }

  getMaxChildren() {
    let res = 0;
    for (let cluster of this.getClusters()) {
      if (cluster.getChildren().length > res) {
        res = cluster.getChildren().length;
      }
    }
    return res;
  }

  getClusters() {
    let clusters = [];
    for (let i = 0; i < this.nodes.length; i++) {
      let node = this.getNodes().at(i);
      if (node.getNodeType() === NodeType.Cluster) {
        clusters.push(node);
      }
    }
    return clusters;
  }

  // Reorder nodes based on solver output
  setNodeOrder(order, drawer = null) {
    if (!Array.isArray(order)) {
      console.error("Invalid order data. Expected an array:", order);
      return;
    }

    const nodeMap = new Map(this.nodes.map((node) => [node.getID(), node]));
    const reorderedNodes = [];

    for (const id of order) {
      const node = nodeMap.get(id);
      if (node) reorderedNodes.push(node);
    }

    // Keep nodes that were not mentioned in the order
    for (const node of this.nodes) {
      if (!order.includes(node.getID())) {
        reorderedNodes.push(node);
      }
    }

    this.nodes = reorderedNodes;
    // console.log("Node order updated successfully.");

    // Auto redraw if drawer provided
    if (drawer && typeof drawer.draw === "function") {
      // console.log("Redrawing graph with new order...");
      drawer.draw("#graph-container");
    }
  }

  async readFromJSON(instance) {
    try {
      const response = await fetch("/api/graph/" + instance);
      const data = await response.json();

      const isDirected = data.directed === 1;
      this.setIsDirected(isDirected);

      const queue = [];
      const nodeMap = new Map();

      // enqueue root nodes (no parent)
      for (const node of data.nodes) {
        if (node.parent === null) {
          let type = NodeType.Vertex;
          if (node.type === "cluster") {
            type = NodeType.Cluster;
          }
          let vertex = new Node(node.id, null, type);

          // STORE LABEL IF PROVIDED
          if (node.label) {
            vertex.customLabel = node.label;
          }

          nodeMap.set(node.id, vertex);
          this.nodes.push(vertex);
          queue.push(node);
        }
      }

      // BFS loop
      while (queue.length > 0) {
        const current = queue.shift();

        for (const node of data.nodes) {
          if (node.parent === current.id) {
            let type = NodeType.Vertex;
            if (node.type === "cluster") {
              type = NodeType.Cluster;
            }
            let vertex = new Node(node.id, nodeMap.get(node.parent), type);

            // STORE LABEL IF PROVIDED
            if (node.label) {
              vertex.customLabel = node.label;
            }

            nodeMap.set(node.id, vertex);
            this.nodes.push(vertex);
            queue.push(node);
          }
        }
      }

      for (const edge of data.edges) {
        const edgeLabel = edge.label || null;
        const edgeWeight = edge.weight || null;
        this.edges.push(
          new Edge(
            nodeMap.get(edge.source),
            nodeMap.get(edge.target),
            edgeLabel,
            edgeWeight
          )
        );
      }
    } catch (err) {
      console.error("Error fetching data:", err);
    }
  }

  containsReverseEdge(edge) {
    for (let other of this.edges) {
      if (edge.getSource() === other.getTarget()) {
        if (edge.getTarget() === other.getSource()) {
          return true;
        }
      }
    }
    return false;
  }
}

export class Node {
  constructor(id, parentNode, type) {
    this.id = id;
    this.parentNode = parentNode;
    this.type = type;
    this.children = [];
    this.customLabel = null;
    if (parentNode != null) {
      parentNode.addChild(this);
    }
  }

  addChild(child) {
    this.children.push(child);
  }

  getChildren() {
    return this.children;
  }

  getNodeType() {
    return this.type;
  }

  getID() {
    return this.id;
  }

  getParent() {
    return this.parentNode;
  }

  getLeaves() {
    let res = [];
    if (this.type === NodeType.Vertex) {
      res.push(this);
    } else {
      for (let child of this.children) {
        for (let leaf of child.getLeaves()) {
          res.push(leaf);
        }
      }
    }
    return res;
  }

  getDescendants() {
    const descendants = [];
    const children = this.getChildren();

    for (const child of children) {
      descendants.push(child);
      if (child.getChildren().length > 0) {
        descendants.push(...child.getDescendants());
      }
    }
    return descendants;
  }
}

export class Edge {
  constructor(source, target, label = null, weight = null) {
    this.source = source;
    this.target = target;
    this.label = label;
    this.weight = weight;
  }
  getSource() {
    return this.source;
  }

  getTarget() {
    return this.target;
  }

  getLabel() {
    return this.label;
  }

  getWeight() {
    return this.weight;
  }
}
