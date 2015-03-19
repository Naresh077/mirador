(function($) {

  $.Workspace = function(options) {

    jQuery.extend(true, this, {
      workspaceSlotCls: 'slot',
      focusedSlot:      null,
      slots:            [],
      windows:          [],
      appendTo:         null,
      parent:           null,
      layoutDescription:    null
    }, options);

    this.element  = this.element || jQuery('<div class="workspace-container" id="workspace">');
    this.init();

  };

  $.Workspace.prototype = {
    init: function () {
      this.element.appendTo(this.appendTo);
      if (this.type === "none") {
        this.parent.toggleSwitchWorkspace();
        return;
      }

      this.calculateLayout();

      this.bindEvents();
    },

    get: function(prop, parent) {
      if (parent) {
        return this[parent][prop];
      }
      return this[prop];
    },

    set: function(prop, value, options) {
      var _this = this;
      if (options) {
        this[options.parent][prop] = value;
      } else {
        this[prop] = value;
      }
      jQuery.publish(prop + '.set', value);
    },

    calculateLayout: function() {
      var _this = this,
      layout;

      _this.layout = layout = new Isfahan({
        containerId: _this.element.attr('id'),
        layoutDescription: _this.layoutDescription,
        configuration: null,
        padding: 3 
      });

      var data = layout.filter( function(d) {
        return !d.children;
      });

      // Data Join.
      var divs = d3.select("#" + _this.element.attr('id')).selectAll(".layout-slot")
      .data(data, function(d) { return d.id; });

      // Implicitly updates the existing elements.
      // Must come before the enter function.
      divs.call(cell);

      // Enter
      divs.enter().append("div")
      .attr("class", "layout-slot")
      .attr("data-layout-slot-id", function(d) { return d.id; })
      .call(cell)
      .each(function(d) {
        var appendTo = _this.element.children('div').filter('[data-layout-slot-id="'+ d.id+'"]')[0];
        _this.slots.push(new $.Slot({
          slotID: d.id,
          layoutAddress: d.address,
          focused: true,
          parent: _this,
          appendTo: appendTo
        }));
      });

      // Exit
      divs.exit()
      .remove("div")
      .each(function(d) { 
        var slotMap = _this.slots.reduce(function(map, temp_slot) {
          if (d.id === temp_slot.slotID) {
            map[d.id] = temp_slot;
          }
          return map;
        }, {}),
        slot = slotMap[d.id];
        if (slot && slot.window) {
          jQuery.publish("windowRemoved", slot.window.id);
        }
        _this.slots.splice(_this.slots.indexOf(slot), 1);
      });

      function cell() {
        this
        .style("left", function(d) { return d.x + "px"; })
        .style("top", function(d) { return d.y + "px"; })
        .style("width", function(d) { return Math.max(0, d.dx ) + "px"; })
        .style("height", function(d) { return Math.max(0, d.dy ) + "px"; });
      }

      var root = jQuery.grep(_this.layout, function(node) { return !node.parent;})[0];
      jQuery.publish("layoutChanged", root);
    },

    split: function(targetSlot, direction) {
      var _this = this,
      node = jQuery.grep(_this.layout, function(node) { return node.id === targetSlot.slotID; })[0];
      nodeIndex = node.parent ? node.parent.children.indexOf(node) : 0,
      nodeIsNotRoot = node.parent;

      function addSibling(node, indexDifference) {
        if (nodeIsNotRoot) {
          var siblingIndex = nodeIndex + indexDifference,
          newSibling = _this.newNode(node.type, node);

          node.parent.children.splice(siblingIndex, 0, newSibling);
          _this.layout.push(newSibling);
          return newSibling;
        }

        // handles the case where the root needs to be mutated.
        node.type = node.type === 'row' ? 'column' : 'row';
        mutateAndAdd(node, indexDifference);
      }

      function mutateAndAdd(node, indexDifference) {
        // Locally mutate the tree to accomodate a 
        // sibling of another kind, transforming
        // both the target node and its parent.
        var newParent = _this.newNode(node.type, node.parent);

        // Flip its type while keeping
        // the same id.
        node.type = node.type === 'row' ? 'column' : 'row';

        // Create a new node (which will be childless)
        // that is also a sibling of this node.
        newSibling = _this.newNode(node.type, newParent);

        // maintain array ordering.
        newParent.children = [];
        newParent.children.push(node); // order matters, place node first.
        newParent.children.splice(indexDifference, 0, newSibling); // order matters, so put new sibling on one side or the other.
        if (nodeIsNotRoot) {
          newParent.parent = node.parent;
          // replace the old node in its parent's child
          // array with the new parent.
          newParent.parent.children[nodeIndex] = newParent;
        }

        node.parent = newParent;
        _this.layout.push(newParent, newSibling);
      }

      if (node.type === 'column') {
        // Since it is a column:
        // 
        // If adding to a side, simply
        // add a sibling.
        // Left means before, right means after.
        if (direction === 'r' || direction === 'l') {
          indexDifference = direction === 'r' ? 1 : 0;
          addSibling(node, indexDifference);
        } 
        // If adding above or below, the
        // operation must be changed to mutating
        // the structure. 
        // Up means before, Down means after.
        else {
          indexDifference = direction === 'd' ? 1 : 0;
          mutateAndAdd(node, indexDifference);
        }
      } else {
        // Since it is a row:
        //
        // If adding to a side, mutate the 
        // structure.
        // Left means before, right means after.
        if (direction === 'r' || direction === 'l') {
          indexDifference = direction === 'r' ? 1 : 0;
          mutateAndAdd(node, indexDifference);
        } 
        // If adding above or below, the
        // operations must be switched to adding
        // a sibling. 
        // Up means before, Down means after.
        else {
          indexDifference = direction === 'd' ? 1 : 0;
          addSibling(node, indexDifference);
        }
      }

      // Recalculate the layout.
      // The original hierarchical structure is
      // accessible from the root node. Passing 
      // it back through the layout code will 
      // recalculate everything else needed for 
      // the redraw.
      var root = jQuery.grep(_this.layout, function(node) { return !node.parent;})[0];
      _this.layoutDescription = root;
      _this.calculateLayout();

    },

    splitRight: function(targetSlot) {
      var _this = this;
      _this.split(targetSlot, 'r');
    },

    splitLeft: function(targetSlot) {
      var _this = this;
      _this.split(targetSlot, 'l');
    },

    splitUp: function(targetSlot) {
      var _this = this;
      _this.split(targetSlot, 'u');
    },

    splitDown: function(targetSlot) {
      var _this = this;
      _this.split(targetSlot, 'd');
    },

    removeNode: function(targetSlot) {
      // de-mutate the tree structure.
      var _this = this,
      node = jQuery.grep(_this.layout, function(node) { return node.id === targetSlot.slotID; })[0],
      nodeIndex = node.parent.children.indexOf(node),
      parentIndex,
      remainingNode,
      root = jQuery.grep(_this.layout, function(node) { return !node.parent;})[0];

      if (node.parent.children.length === 2) {
        // de-mutate the tree without destroying
        // the children of the remaining node, 
        // which in this case means changing their
        // IDs.
        node.parent.children.splice(nodeIndex,1);
        remainingNode = node.parent.children[0];

        remainingNode.parent.id = remainingNode.id;
        delete node.parent;
      } else if (node.parent.children.length === 1) { 
      } else { 
        // If the node is one of more than 2 siblings,
        // simply splice it out of the parent's children 
        // array.
        node.parent.children.splice(nodeIndex, 1);
      }

      _this.layoutDescription = root;
      _this.calculateLayout();
    },

    newNode: function(type, parent) {
      if (typeof parent === 'undefined') {
        return {
          type: type,
          id: $.genUUID()
        };
      } else {
        return {
          type: type,
          id: $.genUUID(),
          parent: parent
        };
      }
    },

    getSlotFromAddress: function(address) {
      var _this = this;
      return _this.slots.filter(function(slot) {
        return slot.layoutAddress === address;
      })[0];
    },

    resetLayout: function(layoutDescription) {
      this.layoutDescription = layoutDescription;
      this.calculateLayout();
      this.placeWindows();
    },

    placeWindows: function() {
      // take the windows array and place
      // as many windows into places as can 
      // fit.
      console.log('placing windows');
    },

    getAvailableSlotPosition: function() {
      var toReturn = null;
      jQuery.each(this.slots, function(index, value) {
        if (!value.window) {
          toReturn = value.layoutAddress;
          return false;
        }
      });
      return toReturn;
    },

    bindEvents: function() {
      var _this = this;

      d3.select(window).on('resize', function(event) {
        _this.calculateLayout();
      });
    },

    clearSlot: function(slotId) {
      if (this.slots[slodId].windowElement) { 
        this.slots[slotId].windowElement.remove();
      }
      this.slots[slotId].window = null;
    },

    addItem: function(slot) {
      this.focusedSlot = slot;
      this.parent.toggleLoadWindow();
    },

    addWindow: function(windowConfig) {
      // Windows can be added from a config,
      // from a saved state, (in both those cases they are in the form of "windowObjects")
      // from the workspace windows list after a grid layout change,
      // from the manifests panel in image mode,
      // or from the manifests panel in thumbnail mode.
      var _this = this,
      newWindow;

      jQuery.each(_this.parent.overlayStates, function(oState, value) {
        // toggles the other top-level panels closed and focuses the
        // workspace. For instance, after selecting an object from the
        // manifestPanel.
        _this.parent.set(oState, false, {parent: 'overlayStates'});
      });

      if (windowConfig.slotAddress) {
        console.log('getting slot from address');
        targetSlot = _this.getSlotFromAddress(windowConfig.slotAddress);
      } else {
        console.log('getting slot from Focused Slot');
        targetSlot = _this.focusedSlot || _this.slots.filter(function(slot) {
          return slot.hasOwnProperty('window') ? true : false;
        })[0];
      }

      windowConfig.parent = targetSlot;
      windowConfig.slotAddress = targetSlot.layoutAddress;
      windowConfig.id = windowConfig.id || $.genUUID();

      newWindow = new $.Window(windowConfig);
      _this.windows.push(newWindow);

      targetSlot.placeWindow(newWindow);

      jQuery.publish("windowAdded", {id: windowConfig.id, slotAddress: windowConfig.slotAddress});
      //this needs to be called after the window is visible so that the thumbnail position is not 0,0 and therefore can be scrolled
      jQuery.publish(('currentCanvasIDUpdated.' + windowConfig.id), windowConfig.currentCanvasID);
    }
  };

}(Mirador));
