let all_nodes = [];
class ComputeNode {
    /**
     * Make a generic compute node.
     * Adds the node to the global map of nodenames to nodes (for calling from html listeners).
     *
     * @param name : Name of the node (string). Must be unique. Must "fit in" a JS string (terminated by single quotes).
     */
    constructor(name) {
        this.inputs = [];   // parent nodes
        this.input_translation = new Map();
        this.children = [];
        this.value = null;
        this.name = name;
        this.update_task = null;
        this.fail_cb = false;   // Set to true to force updates even if parent failed.
        this.dirty = true;
        this.inputs_dirty = new Map();
        this.inputs_dirty_count = 0;
        all_nodes.push(this);
    }

    /**
     * Request update of this compute node. Pushes updates to children.
     */
    update() {
        if (this.inputs_dirty_count != 0) {
            return;
        }
        if (!this.dirty) {
            return;
        }
        let calc_inputs = new Map();
        for (const input of this.inputs) {
            calc_inputs.set(this.input_translation.get(input.name), input.value);
        }
        this.value = this.compute_func(calc_inputs);
        this.dirty = false;
        for (const child of this.children) {
            child.mark_input_clean(this.name, this.value);
        }
        return this;
    }

    /**
     * Mark parent as not dirty. Propagates calculation if all inputs are present.
     */
    mark_input_clean(input_name, value) {
        if (value !== null || this.fail_cb) {
            if (this.inputs_dirty.get(input_name)) {
                this.inputs_dirty.set(input_name, false);
                this.inputs_dirty_count -= 1;
            }
            if (this.inputs_dirty_count === 0) {
                this.update();
            }
        }
    }

    mark_input_dirty(input_name) {
        if (!this.inputs_dirty.get(input_name)) {
            this.inputs_dirty.set(input_name, true);
            this.inputs_dirty_count += 1;
        }
    }

    mark_dirty() {
        if (!this.dirty) {
            this.dirty = true;
            for (const child of this.children) {
                child.mark_input_dirty(this.name);
                child.mark_dirty();
            }
        }
        return this;
    }

    /**
     * Get value of this compute node. Can't trigger update cascades (push based update, not pull based.)
     */
    get_value() {
        return this.value
    }

    /**
     * Abstract method for computing something. Return value is set into this.value
     */
    compute_func(input_map) {
        throw "no compute func specified";
    }

    /**
     * Add link to a parent compute node, optionally with an alias.
     */
    link_to(parent_node, link_name) {
        this.inputs.push(parent_node)
        link_name = (link_name !== undefined) ? link_name : parent_node.name;
        this.input_translation.set(parent_node.name, link_name);
        if (parent_node.dirty || (parent_node.value === null && !this.fail_cb)) {
            this.inputs_dirty_count += 1;
            this.inputs_dirty.set(parent_node.name, true);
        }
        parent_node.children.push(this);
        return this;
    }

    /**
     * Delete a link to a parent node.
     * TODO: time complexity of list deletion (not super relevant but it hurts my soul)
     */
    remove_link(parent_node) {
        const idx = this.inputs.indexOf(parent_node);   // Get idx
        this.inputs.splice(idx, 1);                     // remove element

        this.input_translations.delete(parent_node.name);
        const was_dirty = this.inputs_dirty.get(parent_node.name);
        this.inputs_dirty.delete(parent_node.name);
        if (was_dirty) {
            this.inputs_dirty_count -= 1;
        }

        const idx2 = parent_node.children.indexOf(this);
        parent_node.children.splice(idx2, 1);
        return this;
    }
}

/**
 * Schedule a ComputeNode to be updated.
 *
 * @param node : ComputeNode to schedule an update for.
 */
function calcSchedule(node, timeout) {
    if (node.update_task !== null) {
        clearTimeout(node.update_task);
    }
    node.mark_dirty();
    node.update_task = setTimeout(function() {
        node.update();
        node.update_task = null;
    }, timeout);
}

class PrintNode extends ComputeNode {

    constructor(name) {
        super(name);
        this.fail_cb = true;
    }

    compute_func(input_map) {
        console.log([this.name, input_map]);
        return null;
    }
}

/**
 * Node for getting an input from an input field.
 * Fires updates whenever the input field is updated.
 *
 * Signature: InputNode() => str
 */
class InputNode extends ComputeNode {
    constructor(name, input_field) {
        super(name);
        this.input_field = input_field;
        this.input_field.addEventListener("input", () => calcSchedule(this, 500));
        this.input_field.addEventListener("change", () => calcSchedule(this, 5));
        //calcSchedule(this);  Manually fire first update for better control
    }

    compute_func(input_map) {
        return this.input_field.value;
    }
}
