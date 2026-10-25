// Tells the page it is running inside the desktop app. Nothing else is exposed to the page.
const { contextBridge } = require("electron");
contextBridge.exposeInMainWorld("cronoffDesktop", { isDesktop: true, platform: process.platform });
