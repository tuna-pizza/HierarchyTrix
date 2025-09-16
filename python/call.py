# python/call.py

def generate_order(instance):
    """Create the order file for a given instance."""
    import os
    order_folder = os.path.join("data", "order")
    os.makedirs(order_folder, exist_ok=True)
    filepath = os.path.join(order_folder, f"{instance}.txt")

    order_string = "5 4 8 7 6 9 3 2 1"
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(order_string)
    return order_string