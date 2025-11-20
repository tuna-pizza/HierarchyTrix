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
          let vertex = new Node(node.id, null, type, null);

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
            let vertex = new Node(
              node.id,
              nodeMap.get(node.parent),
              type,
              node.weight
            );

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

  /**
   * Calculates the intra-cluster edge statistics (Actual, Potential, Ratio)
   * for a given cluster node based on its bottommost-level descendants.
   * @param {Node} clusterNode
   * @returns {{actualEdges: number, potentialEdges: number, ratio: number}}
   */
  getIntraClusterStats(clusterNode) {
    // Only process clusters, not leaves
    if (clusterNode.getNodeType() === NodeType.Vertex) {
      return { actualEdges: 0, potentialEdges: 0, ratio: 0 };
    }

    // ------------------------------------------------------------
    // 1. Find all bottommost descendant clusters (matrices)
    // ------------------------------------------------------------
    const bottomClusters = [];
    const stack = [clusterNode];

    while (stack.length) {
      const curr = stack.pop();
      const children = curr.getChildren();

      const allVertices = children.every(
        (c) => c.getNodeType() === NodeType.Vertex
      );

      if (allVertices) {
        // This is a bottommost cluster
        bottomClusters.push(curr);
      } else {
        // Keep traversing down
        for (const ch of children) {
          if (ch.getNodeType() !== NodeType.Vertex) {
            stack.push(ch);
          }
        }
      }
    }

    // ------------------------------------------------------------
    // 2. For each bottom cluster: compute edges inside it
    // ------------------------------------------------------------
    let actualEdges = 0;
    let potentialEdges = 0;

    for (const bc of bottomClusters) {
      const leaves = bc.getLeaves(); // all vertices in this matrix
      const leafIDs = new Set(leaves.map((l) => l.getID()));
      const n = leaves.length;

      if (n <= 1) continue;

      const counted = new Set();

      // Count edges inside this bottom cluster
      for (const edge of this.edges) {
        const u = edge.getSource().getID();
        const v = edge.getTarget().getID();

        if (u === v) continue;

        if (leafIDs.has(u) && leafIDs.has(v)) {
          const key = u < v ? `${u}-${v}` : `${v}-${u}`;
          if (!counted.has(key)) {
            counted.add(key);
            actualEdges++;
          }
        }
      }

      // Compute potential edges for THIS cluster and accumulate
      potentialEdges += (n * (n - 1)) / 2;
    }

    const ratio = potentialEdges ? actualEdges / potentialEdges : 0;

    return { actualEdges, potentialEdges, ratio };
  }
}

export class Node {
  constructor(id, parentNode, type, weight = null) {
    this.id = id;
    this.parentNode = parentNode;
    this.type = type;
    this.weight = weight;
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

  getWeight() {
    return this.weight;
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
