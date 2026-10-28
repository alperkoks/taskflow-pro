// Preload script for TaskFlow Pro+ Desktop
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('desktopApp', {
  isElectron: true,
  platform: process.platform,
  version: '26.0.0'
});
