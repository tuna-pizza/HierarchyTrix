const svgNS = "http://www.w3.org/2000/svg";
const cellSize = 40;
const nodeColor = "black";
const cellboundaryColor = "darkgray";
const edgeColor = "rgb(50, 125, 200)";
const arrayBoundaryWidth = "3";
const edgeWidth = "4";
const textSize = "20";
const textOffset = 2;

function hsvToRgb(h, s, v) 
{
	let c = v * s;               // chroma
	let x = c * (1 - Math.abs((h / 60) % 2 - 1));
	let m = v - c;
	let r = 0, g = 0, b = 0;

	if (0 <= h && h < 60) { r = c; g = x; b = 0; }
	else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
	else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
	else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
	else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
	else if (300 <= h && h < 360) { r = c; g = 0; b = x; }

	// convert to 0–255 range
	r = Math.round((r + m) * 255);
	g = Math.round((g + m) * 255);
	b = Math.round((b + m) * 255);

	return [r, g, b];
}

const NodeType =
{
	Cluster: "Cluster",
	Vertex: "Vertex"
}
class Node
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
class Edge
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

class HierarchicallyClusteredGraphDrawer
{
	constructor()
	{
	}
	addConstraints()
	{
		//TODO: Include output from Annika and Marialena
	}
	drawSquare(x,y)
	{
		const square = document.createElementNS(svgNS, "polygon");
		square.setAttribute("points", "" + (x-cellSize/2) + "," + y + " " + x + "," + (y+cellSize/2) + " " + (x+cellSize/2) + "," + y + " " + x + "," + (y-cellSize/2));
		//square.setAttribute("transform", "rotate(-45 " + cellSize/2 + " " + cellSize/2 + ")");
		square.setAttribute("x", x);    // top-left corner
		square.setAttribute("y", y);
		square.setAttribute("stroke", cellboundaryColor);	
		square.setAttribute("stroke-width", arrayBoundaryWidth);	
		return square;
	}
	drawNode(id,x,y,svg)
	{
		const label = document.createElementNS(svgNS, "text");
		label.setAttribute("x", x);          // x position
		label.setAttribute("y", y+textOffset);          // y position
		label.setAttribute("fill", "white");  // text color
		label.setAttribute("font-size", textSize); 
		label.setAttribute("text-anchor", "middle");          // center horizontally
		label.setAttribute("alignment-baseline", "middle");   // center vertically	
		label.textContent = id;   
		let square = this.drawSquare(x,y);
		square.setAttribute("fill", nodeColor);
		svg.appendChild(square);
		svg.appendChild(label);
	}
	drawCluster(cluster,H,offsetX,offsetY,svg)
	{
		let x = offsetX;
		let xcoordMap = new Map();
		for (let child of cluster.getChildren())
		{
			this.drawNode(child.id,x,offsetY,svg);
			xcoordMap.set(child,x);
			x = x + cellSize;
		}
		for (let child1 of cluster.getChildren())
		{
			for (let child2 of cluster.getChildren())
			{
				let x1 = xcoordMap.get(child1);
				let x2 = xcoordMap.get(child2);
				if (x1 < x2)
				{
					let potentialEdges = child1.getLeaves().length*child2.getLeaves().length;
					let actualEdges = H.getNumberOfEdges(child1,child2);	
					let xDist = x2 - x1;
					this.drawClusterEdge(actualEdges/potentialEdges,x1+xDist/2,offsetY-xDist/2,svg);
				}
			}
		}
	}
	drawClusterEdge(connectivity,x,y,svg)
	{
		let square = this.drawSquare(x,y);
		let mapValue = connectivity*0.4;
		const [r, g, b] = hsvToRgb(175, 0.7, 0.95-mapValue);
		if (connectivity === 0)
		{
			r = 255;
			g = 255;
			b = 255;
		}
		square.setAttribute("fill", "rgb("+ r +"," + g + "," +  b + ")");
		svg.appendChild(square);
	}
	drawLinearLayout(H,offsetX,offsetY,svg)
	{
		let xCoordMap = new Map(); 
		const nodes = document.createElementNS(svgNS, "g");
		for (let vertex of H.getVertices())
		{
			this.drawNode(vertex.id,offsetX,offsetY,nodes);
			xCoordMap.set(vertex,offsetX);
			offsetX += 1.5*cellSize;
		}
		for (let edge of H.getEdges())
		{
			let x1 = xCoordMap.get(edge.getSource());
			let x2 = xCoordMap.get(edge.getTarget());
			if (x1 > x2)
			{
				let swap = x1;
				x1 = x2;
				x2 = swap;
			}
			let path = this.drawEdge(x1,x2,offsetY,svg);
			svg.appendChild(path);
		}
		svg.appendChild(nodes);
	}
	drawEdge(x1,x2,y,svg)
	{
		const path = document.createElementNS(svgNS, "path");
		let xDist = x2-x1;
		// Start at (50,150), end at (350,150), control points (150,50) and (250,250)
		path.setAttribute("d", "M " + x1 + " " + y + " C " + x1 + " " + (y + xDist/2) + ", " + x2 + " " + (y + xDist/2) + ", " + x2 + "  " + y);

		// Style
		path.setAttribute("stroke", edgeColor);
		path.setAttribute("stroke-width", edgeWidth);
		path.setAttribute("fill", "none");
		return path;
	}
	draw(H)
	{
		const svg = document.createElementNS(svgNS, "svg");
		svg.setAttribute("viewBox", "0 0 1920 1080");
		svg.setAttribute("width", "1920");
		svg.setAttribute("height", "1080");
		let offsetX = cellSize/2;
		let offsetY = 100;
		for (let cluster of H.getClusters())
		{
			this.drawCluster(cluster,H,offsetX,offsetY,svg);
			offsetX = offsetX + cluster.children.length*cellSize + cellSize+2;
		}
		this.drawLinearLayout(H,cellSize/2,200,svg);
		document.body.appendChild(svg);
	}
}

class HierarchicallyClusteredGraph
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
	getClusters()
	{
		let clusters = [];
		//console.log(this.nodes);
		//console.log(this.nodes.length);
		for (let i = 0; i < this.nodes.length; i++)
		{
			//console.log("THIS"); // now node is the actual object
			let node = this.getNodes().at(i);
			//console.log(node);
			if (node.getNodeType() === NodeType.Cluster) 
			{
				clusters.push(node);
			}
		}
		//console.log(clusters);
		return clusters;
	}
	async readFromJSON(path)
	{
		try 
		{
			const response = await fetch("/api/data"); // calls Node.js endpoint
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
			//console.log(data);
		} 
		catch (err) 	
		{
			console.error("Error fetching data:", err);
		}
		console.log(this);
	}
}
async function main() 
{
    let H = new HierarchicallyClusteredGraph();
    await H.readFromJSON("./sample.json"); // wait for JSON to load
    let HD = new HierarchicallyClusteredGraphDrawer();
    HD.draw(H); // now nodes are loaded, getClusters() will return the correct clusters
}

main();