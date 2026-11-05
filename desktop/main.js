/**
 * macOS masaüstü — admin paneli (canlı URL veya yerel wrangler).
 */
const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("path");

const ADMIN_URL = process.env.CRM_ADMIN_URL || "https://crm.salediscount.online/admin";
const isDev = process.env.CRM_DEV === "1";

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    title: "CRM Item Satış",
    backgroundColor: "#0f172a",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(ADMIN_URL);

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) win.webContents.openDevTools({ mode: "detach" });
}

app.whenReady().then(() => {
  const template = [
    {
      label: "CRM",
      submenu: [
        {
          label: "Yenile",
          accelerator: "CmdOrCtrl+R",
          click: (_, w) => w?.webContents.reload(),
        },
        {
          label: "Ana sayfa",
          click: (_, w) => w?.loadURL(ADMIN_URL),
        },
        { type: "separator" },
        { role: "quit", label: "Çıkış" },
      ],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
