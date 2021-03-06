import { WDialog } from "../leafletClasses";
import Sortable from "../sortable";
import AssignDialog from "./assignDialog";
import SetCommentDialog from "./setCommentDialog";
import MarkerChangeDialog from "./markerChangeDialog";
import WasabeeAgent from "../agent";
import { getSelectedOperation } from "../selectedOp";
import {
  listenForAddedPortals,
  listenForPortalDetails,
  loadFaked,
  clearAllMarkers,
} from "../uiCommands";
import wX from "../wX";

const MarkerList = WDialog.extend({
  statics: {
    TYPE: "markerList",
  },

  addHooks: function () {
    WDialog.prototype.addHooks.call(this);
    const operation = getSelectedOperation();
    this._opID = operation.ID;
    window.map.on("wasabeeUIUpdate", this.markerListUpdate, this);
    window.addHook("portalAdded", listenForAddedPortals);
    window.addHook("portalDetailLoaded", listenForPortalDetails);
    this._displayDialog();
  },

  removeHooks: function () {
    WDialog.prototype.removeHooks.call(this);
    window.map.off("wasabeeUIUpdate", this.markerListUpdate, this);
    window.removeHook("portalAdded", listenForAddedPortals);
    window.removeHook("portalDetailLoaded", listenForPortalDetails);
  },

  _displayDialog: function () {
    const operation = getSelectedOperation();
    loadFaked(operation);

    const buttons = {};
    buttons[wX("CLEAR MARKERS")] = () => {
      clearAllMarkers(getSelectedOperation());
    };

    buttons[wX("OK")] = () => {
      this.closeDialog();
    };

    this.createDialog({
      title: wX("MARKER_LIST", { opName: operation.name }),
      html: this.getListDialogContent(operation).table,
      width: "auto",
      dialogClass: "markerlist",
      buttons: buttons,
      id: window.plugin.wasabee.static.dialogNames.markerList,
    });
  },

  markerListUpdate: function () {
    const operation = getSelectedOperation();
    if (operation.ID != this._opID) console.log("op changed");
    const table = this.getListDialogContent(operation).table;
    this.setContent(table);
    this.setTitle(wX("MARKER_LIST", { opName: operation.name }));
  },

  getListDialogContent: function (operation) {
    const content = new Sortable();
    content.fields = [
      {
        name: wX("ORDER"),
        value: (marker) => marker.order,
        format: (a, m) => (a.textContent = m),
      },
      {
        name: wX("PORTAL"),
        value: (marker) => operation.getPortal(marker.portalId).name,
        sort: (a, b) => a.localeCompare(b),
        format: (a, m, marker) => {
          a.appendChild(
            operation
              .getPortal(marker.portalId)
              .displayFormat(this._smallScreen)
          );
        },
      },
      {
        name: wX("TYPE"),
        value: (marker) => wX(marker.type),
        sort: (a, b) => a.localeCompare(b),
        format: (cell, value, marker) => {
          const d = L.DomUtil.create("span", marker.type, cell);
          d.textContent = value;
          L.DomEvent.on(cell, "click", (ev) => {
            L.DomEvent.stop(ev);
            const ch = new MarkerChangeDialog({ marker: marker });
            ch.enable();
          });
        },
      },
      {
        name: wX("COMMENT"),
        value: (marker) => marker.comment,
        sort: (a, b) => a.localeCompare(b),
        format: (cell, value, marker) => {
          const comment = L.DomUtil.create("a", "", cell);
          comment.textContent = value;
          L.DomEvent.on(cell, "click", (ev) => {
            L.DomEvent.stop(ev);
            const scd = new SetCommentDialog({
              target: marker,
              operation: operation,
            });
            scd.enable();
          });
        },
      },
      {
        name: wX("ASS_TO"),
        value: async (marker) => {
          if (marker.assignedTo != null && marker.assignedTo != "") {
            const agent = await WasabeeAgent.get(marker.assignedTo);
            if (agent != null) return agent.name;
            return "looking up: [" + marker.assignedTo + "]";
          }
          return "";
        },
        sort: (a, b) => a.localeCompare(b),
        format: (cell, value, agent) => {
          const assigned = L.DomUtil.create("a", "", cell);
          assigned.textContent = value;
          if (operation.IsServerOp() && operation.IsWritableOp()) {
            L.DomEvent.on(cell, "click", () => {
              const ad = new AssignDialog({ target: agent });
              ad.enable();
            });
          }
        },
      },
      {
        name: wX("DONE"),
        value: (marker) => marker.state,
        sort: (a, b) => a.localeCompare(b),
        format: (a, m) => {
          if (m == "completed") {
            a.textContent = wX("YES");
          } else {
            a.textContent = wX("NO");
          }
        },
      },
      {
        name: wX("DELETE_MARKER"),
        sort: null,
        value: (m) => m,
        format: (cell, data) => {
          const d = L.DomUtil.create("a", null, cell);
          d.href = "#";
          d.textContent = wX("DELETE_MARKER");
          L.DomEvent.on(d, "click", () => {
            operation.removeMarker(data);
          });
        },
      },
    ];
    content.sortBy = 0;
    content.items = operation.markers;
    return content;
  },
});

export default MarkerList;
