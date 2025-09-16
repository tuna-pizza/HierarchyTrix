export const NodeType =
{
	Cluster: "Cluster",
	Vertex: "Vertex"
}
export class HierarchicallyClusteredGraph
{
	constructor()
	{
		this.nodes = [];
		this.edges = [];
	}
	getNumberOfEdges(node1,node2)
	{
		let myLeaves = node1.getLeaves();
		let otherLeaves = node2.getLeaves();
		let res = 0;
		for (let edge of this.edges)
		{
			if (myLeaves.includes(edge.getSource()) && otherLeaves.includes(edge.getTarget()))
			{
				res++;
			}
			if (otherLeaves.includes(edge.getSource()) && myLeaves.includes(edge.getTarget()))
			{
				res++;
			}
		}
		return res;
	}
	getEdges()
	{
		return this.edges;
	}
	getNodes()
	{
		return this.nodes;
	}
	getNodeByID(id)
	{
		for (let node of this.nodes)
		{
			if (node.getID() === id)
			{
				return node;
			}
		}
		return null;
	}
	getVertices()
	{
		let vertices = [];
		for (let node of this.nodes)
		{
			if (node.getNodeType() === NodeType.Vertex)
			{
				vertices.push(node);
			}
		}
		return vertices;
	}
	getClusterLayers()
	{
		let clusterLayers = [];
		let nextLayer = [];
		for (let cluster of this.getClusters())
		{
			if (cluster.getParent() === null)
			{
				nextLayer.push(cluster);
			}
		}
		while (nextLayer.length > 0)
		{
			let currentLayer = nextLayer;
			clusterLayers.push(nextLayer);
			nextLayer = [];
			for (let cluster of currentLayer)
			{
				for (let child of cluster.getChildren())
				{
					if (child.getNodeType() === NodeType.Cluster)
					{
						nextLayer.push(child);
					}
				}
			}
		}
		return clusterLayers;
	}
	getMaxChildren()
	{
		let res = 0;
		for (let cluster of this.getClusters())
		{
			if (cluster.getChildren().length > res)
			{
				res = cluster.getChildren().length;
			}
		}
		return res;
	}
	getClusters()
	{
		let clusters = [];
		for (let i = 0; i < this.nodes.length; i++)
		{
			let node = this.getNodes().at(i);
			if (node.getNodeType() === NodeType.Cluster) 
			{
				clusters.push(node);
			}
		}
		return clusters;
	}
	async readFromJSON(instance)
	{
		try 
		{
			const response = await fetch("/api/graph/" + instance); // calls Node.js endpoint
			const data = await response.json();
			const queue = [];
			const nodeMap = new Map();
			// enqueue root nodes (no parent)
			for (const node of data.nodes) 
			{
				if (node.parent === null) 
				{
					let type = NodeType.Vertex;
					if (node.type === 'cluster')
					{
						type = NodeType.Cluster;
					}
					let vertex = new Node(node.id,null,type)
					nodeMap.set(node.id,vertex);
					this.nodes.push(vertex);
					queue.push(node);
				}
			}
			// BFS loop
			while (queue.length > 0) 
			{
				const current = queue.shift();

				// enqueue children of the current node
				for (const node of data.nodes) {
				  if (node.parent === current.id) 
				  {
					let type = NodeType.Vertex;
					if (node.type === 'cluster')
					{
						type = NodeType.Cluster;
					}
					let vertex = new Node(node.id,nodeMap.get(node.parent),type);
					nodeMap.set(node.id,vertex);
					this.nodes.push(vertex);
					queue.push(node);
				  }
				}
			}
			for (const edge of data.edges)
			{
				this.edges.push(new Edge(nodeMap.get(edge.source),nodeMap.get(edge.target)));
			}
		} 
		catch (err) 	
		{
			console.error("Error fetching data:", err);
		}
	}
}
export class Node
{
	constructor(id,parentNode,type)
	{
		this.id = id;
		this.parentNode = parentNode;
		this.type = type;
		this.children = [];
		if (parentNode != null)
		{
			parentNode.addChild(this);
		}
	}
	addChild(child)
	{
		this.children.push(child);
	}
	getChildren()
	{
		return this.children;
	}
	getNodeType()
	{
		return this.type;
	}
	getID()
	{
		return this.id;
	}
	getParent()
	{
		return this.parentNode;
	}
	getLeaves()
	{
		let res = [];
		if (this.type === NodeType.Vertex)
		{
			res.push(this);
		}
		else
		{
			for (let child of this.children)
			{
				for (let leaf of child.getLeaves())
				{
					res.push(leaf);
				}
			}
		}
		return res;
	}
}
export class Edge
{
	constructor(source,target)
	{
		this.source = source;
		this.target = target;
	}
	getSource()
	{
		return this.source;
	}
	getTarget()
	{
		return this.target;
	}
}