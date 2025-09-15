
import json
import random
import os

def generate_hierarchy(num_clusters, num_leaves):
    """
    Generate nodes with parent-child relationships.
    Returns (nodes, leaf_ids).
    """
    nodes = []
    leaf_ids = []
    clusters = ["A"]  # root
    nodes.append({"id": "A", "parent": None, "type": "cluster"})

    # Create cluster nodes
    for i in range(num_clusters):
        cid = chr(66 + i)  # B, C, D, ...
        parent = random.choice(clusters)  # random existing cluster
        nodes.append({"id": cid, "parent": parent, "type": "cluster"})
        clusters.append(cid)

    # Create leaf nodes
    for i in range(1, num_leaves + 1):
        parent = random.choice(clusters)
        nodes.append({"id": str(i), "parent": parent, "type": "leaf"})
        leaf_ids.append(str(i))

    return nodes, leaf_ids


def generate_edges(leaf_ids, max_edges):
    """
    Generate random edges between leaves.
    """
    edges = []
    possible_pairs = [(u, v) for i, u in enumerate(leaf_ids) for v in leaf_ids[i+1:]]
    num_edges = random.randint(1, min(max_edges, len(possible_pairs)))
    chosen = random.sample(possible_pairs, num_edges)

    for u, v in chosen:
        edges.append({"source": u, "target": v})

    return edges


def generate_json_files(output_dir="data", num_files=10):
    os.makedirs(output_dir, exist_ok=True)

    for i in range(1, num_files + 1):
        num_clusters = random.randint(2, 5)     # vary number of clusters
        num_leaves = random.randint(5, 12)      # vary number of leaves
        nodes, leaf_ids = generate_hierarchy(num_clusters, num_leaves)
        edges = generate_edges(leaf_ids, max_edges=2*num_leaves)

        graph_data = {"nodes": nodes, "edges": edges}

        filename = os.path.join(output_dir, f"sample_{i}.json")
        with open(filename, "w") as f:
            json.dump(graph_data, f, indent=2)

        print(f"Generated {filename} with {len(nodes)} nodes and {len(edges)} edges")


# Run the generator
generate_json_files()
