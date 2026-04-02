const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld(
  "bitifyDesktop",
  Object.freeze({
    isDesktop: true,
  }),
);