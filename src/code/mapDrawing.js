import WasabeeMe from "./me";
import WasabeeAnchor from "./anchor";
import { teamPromise } from "./server";

var Wasabee = window.plugin.wasabee;

//** This function draws things on the layers */
export const drawThings = op => {
  // console.time("drawThings");
  updateAnchors(op);
  updateMarkers(op);

  /* console.time("updateLinks");
  updateLinks(op);
  console.timeEnd("updateLinks"); */
  // console.time("resetLinks");
  resetLinks(op);
  // console.timeEnd("resetLinks");
  //console.timeEnd("drawThings");
};

const updateMarkers = op => {
  if (window.isLayerGroupDisplayed("Wasabee Draw Markers") === false) return; // yes, === false, undefined == true
  if (!op.markers || op.markers.length == 0) {
    Wasabee.markerLayerGroup.clearLayers();
    return;
  }

  // get a list of every currently drawn marker
  const layerMap = new Map();
  for (const l of Wasabee.markerLayerGroup.getLayers()) {
    layerMap.set(l.options.id, l._leaflet_id);
  }

  // add any new ones, remove any existing from the list
  // markers don't change, so this doesn't need to be too smart
  for (const m of op.markers) {
    if (layerMap.has(m.portalId)) {
      const ll = Wasabee.markerLayerGroup.getLayer(layerMap.get(m.portalId));
      if (m.state != ll.options.state) {
        // state changed, update icon
        Wasabee.markerLayerGroup.removeLayer(ll);
        const newicon = L.icon({
          iconUrl: m.icon,
          shadowUrl: null,
          iconSize: L.point(24, 40),
          iconAnchor: L.point(12, 40),
          popupAnchor: L.point(-1, -48)
        });
        ll.setIcon(newicon);
        ll.addTo(Wasabee.markerLayerGroup);
      }
      layerMap.delete(m.portalId);
    } else {
      addMarker(m, op);
    }
  }

  // remove any that were not processed
  // eslint-disable-next-line
  for (const [k, v] of layerMap) {
    Wasabee.markerLayerGroup.removeLayer(v);
  }
};

/** This function adds a Markers to the target layer group */
const addMarker = (target, operation) => {
  const targetPortal = operation.getPortal(target.portalId);
  const wMarker = L.marker(targetPortal.latLng, {
    title: targetPortal.name,
    id: target.portalId,
    state: target.state,
    icon: L.icon({
      iconUrl: target.icon,
      shadowUrl: null,
      iconSize: L.point(24, 40),
      iconAnchor: L.point(12, 40),
      popupAnchor: L.point(-1, -48)
    })
  });

  // register the marker for spiderfied click
  window.registerMarkerForOMS(wMarker);
  wMarker.bindPopup("loading...");
  wMarker.off("click", wMarker.openPopup, wMarker);
  wMarker.on(
    "click",
    () => {
      // IITCs version of leaflet does not have marker.isPopupOpen()
      wMarker.setPopupContent(target.getMarkerPopup(wMarker, operation));
      wMarker.update();
      wMarker.openPopup();
    },
    wMarker
  );
  wMarker.on(
    "spiderfiedclick",
    () => {
      wMarker.setPopupContent(target.getMarkerPopup(wMarker, operation));
      wMarker.update();
      wMarker.openPopup();
    },
    wMarker
  );
  wMarker.addTo(Wasabee.markerLayerGroup);
};

/** reset links is consistently 1ms faster than update, and is far safer */
const resetLinks = operation => {
  if (window.isLayerGroupDisplayed("Wasabee Draw Links") === false) return; // yes, === false, undefined == true
  Wasabee.linkLayerGroup.clearLayers();

  if (!operation.links || operation.links.length == 0) return;

  // pre-fetch the op color outside the loop -- is this actually helpful?
  let lt = Wasabee.static.layerTypes.get("main");
  if (Wasabee.static.layerTypes.has(operation.color)) {
    lt = Wasabee.static.layerTypes.get(operation.color);
  }
  lt.link.color = lt.color;

  for (const l of operation.links) {
    addLink(l, lt.link, operation);
  }
};

/** reset links is consistently 1ms faster than update, and is far safer */
// eslint-disable-next-line
const updateLinks = operation => {
  if (window.isLayerGroupDisplayed("Wasabee Draw Links") === false) return; // yes, === false, undefined == true
  if (!operation.links || operation.links.length == 0) {
    Wasabee.linkLayerGroup.clearLayers();
    return;
  }

  const layerMap = new Map();
  for (const l of Wasabee.linkLayerGroup.getLayers()) {
    layerMap.set(l.options.id, l._leaflet_id);
  }

  // pre-fetch the op color outside the loop
  let lt = Wasabee.static.layerTypes.get("main");
  if (Wasabee.static.layerTypes.has(operation.color)) {
    lt = Wasabee.static.layerTypes.get(operation.color);
  }
  lt.link.color = lt.color;

  for (const l of operation.links) {
    if (layerMap.has(l.ID)) {
      const ll = Wasabee.linkLayerGroup.getLayer(layerMap.get(l.ID));
      if (
        l.color != ll.options.Wcolor ||
        l.fromPortalId != ll.options.fm ||
        l.toPortalId != ll.options.to
      ) {
        Wasabee.linkLayerGroup.removeLayer(ll);
        addLink(l, lt.link, operation);
      }
      layerMap.delete(l.ID);
    } else {
      addLink(l, lt.link, operation);
    }
  }

  // eslint-disable-next-line
  for (const [k, v] of layerMap) {
    Wasabee.linkLayerGroup.removeLayer(v);
  }
};

/** This function adds a portal to the portal layer group */
const addLink = (wlink, style, operation) => {
  // determine per-link color
  if (wlink.color != "main" && Wasabee.static.layerTypes.has(wlink.color)) {
    const linkLt = Wasabee.static.layerTypes.get(wlink.color);
    style = linkLt.link;
    style.color = linkLt.color;
  }

  const latLngs = wlink.getLatLngs(operation);
  if (!latLngs) {
    console.log("LatLngs was null: op missing portal data?");
    return;
  }
  const newlink = new L.GeodesicPolyline(latLngs, style);
  // these are used for updateLink and can be removed if we get rid of it
  newlink.options.id = wlink.ID;
  newlink.options.fm = wlink.fromPortalId;
  newlink.options.to = wlink.toPortalId;
  newlink.options.Wcolor = wlink.Wcolor;
  //
  newlink.addTo(Wasabee.linkLayerGroup);
};

/** this function fetches and displays agent location */
export const drawAgents = () => {
  if (window.isLayerGroupDisplayed("Wasabee Agents") === false) return; // yes, === false, undefined == true

  if (!WasabeeMe.isLoggedIn()) {
    return;
  }

  const layerMap = new Map();
  for (const l of Wasabee.agentLayerGroup.getLayers()) {
    layerMap.set(l.options.id, l._leaflet_id);
  }

  const doneAgents = new Array();
  const me = WasabeeMe.get();
  for (const t of me.Teams) {
    if (t.State != "On") continue;

    // purge what we have
    if (Wasabee.teams.size != 0 && Wasabee.teams.has(t.ID)) {
      Wasabee.teams.delete(t.ID);
    }

    /* this fetches the team into Wasabee.teams */
    teamPromise(t.ID).then(
      function(team) {
        for (const agent of team.agents) {
          if (!layerMap.has(agent.id) && doneAgents.indexOf(agent.id) == -1) {
            // new, add to map
            doneAgents.push(agent.id);
            if (agent.lat && agent.lng) {
              const marker = L.marker(agent.latLng, {
                title: agent.name,
                icon: L.icon({
                  iconUrl: agent.pic,
                  shadowUrl: null,
                  iconSize: L.point(41, 41),
                  iconAnchor: L.point(25, 41),
                  popupAnchor: L.point(-1, -48)
                }),
                id: agent.id
              });

              window.registerMarkerForOMS(marker);
              marker.bindPopup(agent.getPopup());
              marker.off("click", agent.openPopup, agent);
              marker.on(
                "click",
                () => {
                  marker.setPopupContent(agent.getPopup());
                  marker.update();
                  marker.openPopup();
                },
                agent
              );
              marker.on(
                "spiderfiedclick",
                () => {
                  marker.setPopupContent(agent.getPopup());
                  marker.update();
                  marker.openPopup();
                },
                marker
              );

              marker.addTo(Wasabee.agentLayerGroup);
            }
          } else {
            // just move existing
            if (doneAgents.indexOf(agent.id) == -1) {
              const a = layerMap.get(agent.id);
              const al = Wasabee.agentLayerGroup.getLayer(a);
              al.setLatLng(agent.latLng);
              layerMap.delete(agent.id);
              doneAgents.push(agent.id);
            }
          }
        }
      },
      function(err) {
        console.log(err);
      }
    );
  } // for t of whichlist

  // remove those not found in this fetch
  for (const l in layerMap) {
    Wasabee.agentLayerGroup.removeLayer(l);
  }
};

const updateAnchors = op => {
  if (window.isLayerGroupDisplayed("Wasabee Draw Portals") === false) return; // yes, === false, undefined == true
  if (!op.anchors || op.anchors.length == 0) {
    Wasabee.portalLayerGroup.clearLayers();
    return;
  }

  const layerMap = new Map();
  for (const l of Wasabee.portalLayerGroup.getLayers()) {
    if (l.options.color != op.color) {
      // if the op color changed, remove and re-add
      Wasabee.portalLayerGroup.removeLayer(l._leaflet_id);
    } else {
      layerMap.set(l.options.id, l._leaflet_id);
    }
  }

  for (const a of op.anchors) {
    if (layerMap.has(a)) {
      layerMap.delete(a); // no changes
    } else {
      addAnchorToMap(a, op);
    }
  }

  // eslint-disable-next-line
  for (const [k, v] of layerMap) {
    Wasabee.portalLayerGroup.removeLayer(v);
  }
};

/** This function adds a portal to the portal layer group */
const addAnchorToMap = (portalId, operation) => {
  const anchor = new WasabeeAnchor(portalId, operation);
  const marker = L.marker(anchor.latLng, {
    title: anchor.name,
    alt: anchor.name,
    id: portalId,
    color: anchor.color,
    icon: L.icon({
      iconUrl: anchor.icon,
      shadowUrl: null,
      iconAnchor: [12, 41],
      iconSize: [25, 41],
      popupAnchor: [0, -35]
    })
  });

  window.registerMarkerForOMS(marker);
  const content = anchor.popupContent(marker, operation);
  marker.bindPopup(content);
  marker.off("click", marker.openPopup, marker);
  marker.on(
    "click",
    () => {
      marker.setPopupContent(content);
      marker.update();
      marker.openPopup();
    },
    marker
  );
  marker.on(
    "spiderfiedclick",
    () => {
      marker.setPopupContent(content);
      marker.update();
      marker.openPopup();
    },
    marker
  );
  marker.addTo(Wasabee.portalLayerGroup);
};
