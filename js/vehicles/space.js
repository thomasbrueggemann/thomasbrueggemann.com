// Space vehicles of the Torus scene: the shuttle that docks on the underside of the hub, and the elevator cars that
// run up and down the six spokes. Everything here is a child of the spinning station group, in its own frame
// (y is the spin axis; the hub's underside dock is at y ≈ -215; spoke k runs along (cos a, 0, sin a) with
// a = api.SPOKES[k], from the hub's rim (r = api.HUB_R) to the ring's inner face (r = R - RT)).
// Contract: buildSpace(api) builds meshes into api.station and returns { update(t) }, called every frame with the
// scene time in seconds.

export function buildSpace(api) {
  const { THREE, station, hullMat, navPoints, R, RT, TAU, smooth } = api;
  const dark = hullMat([0.08, 0.085, 0.09]);
  // elevator cars running up and down the spokes
  const pods = [];
  for (const a of api.SPOKES) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 5), dark);
    m.frustumCulled = false; station.add(m);
    pods.push({ m, a, ph: pods.length * 0.37 });
  }
  // a shuttle that comes in along the axis to the dock and leaves again
  const shuttle = new THREE.Group();
  {
    const sm = hullMat([0.62, 0.62, 0.64]);
    const parts = [new THREE.CylinderGeometry(5, 6.5, 34, 16), new THREE.ConeGeometry(5, 9, 16).rotateX(Math.PI).translate(0, -21.5, 0),
      new THREE.BoxGeometry(30, 1.2, 8).translate(0, 8, 0), new THREE.CylinderGeometry(3, 4, 4, 12).translate(-8, 19, 0), new THREE.CylinderGeometry(3, 4, 4, 12).translate(8, 19, 0)];
    parts.forEach((g) => { const m = new THREE.Mesh(g, sm); m.frustumCulled = false; shuttle.add(m); });
    // lights: kind 3 is a steady engine glow, 0 a white strobe (see NAV_VERT in ../torus3d.js)
    shuttle.add(navPoints([-8, 22, 0, 8, 22, 0, 0, -26, 0], [3, 0, 0, 0, 3, 0, 0, 0, 0, 0.3, 0, 0]));
    station.add(shuttle);
  }
  return {
    update(t) {
      for (const p of pods) {
        const u = 0.5 - 0.5 * Math.cos((t / 40 + p.ph) * TAU), r = 80 + u * (R - RT - 110);
        p.m.position.set(Math.cos(p.a) * r, 10.5, Math.sin(p.a) * r);
        p.m.rotation.y = -p.a;
      }
      const c = (t + 20) % 120;                       // in over 50 s, docked 30 s, out over 40 s
      const y = c < 50 ? 2600 - 2378 * smooth(0, 50, c) : c < 80 ? 222 : 222 + 2600 * smooth(80, 120, c) ** 2;
      shuttle.position.set(0, -(y + 22), 0);           // it docks on the underside, facing the opening view
      shuttle.rotation.x = Math.PI;
      shuttle.visible = y < 2500;
    },
  };
}
