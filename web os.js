/* ============================================================================
   550A SERIES — Desktop Shell Script
   ----------------------------------------------------------------------------
   ========================================================================= */

(() => {
  /* -------------------------------------------------------------------------
     WINDOW BOOKKEEPING
     ---------------------------------------------------------------------- */

  /* Map<appName, HTMLElement> so any function can look up an app window
     from a plain string.  Built once at startup from the DOM. */
  const startupScreen = document.querySelector("#startup-screen");
  const loginScreen = document.querySelector("#login-screen");
  const loginForm = document.querySelector("#login-form");
  const usernameInput = document.querySelector("#username-input");
  const startupStatus = document.querySelector("#startup-status-text");
  const desktop = document.querySelector("#desktop");

  function applyUsername(username) {
    const cleanUsername = username.trim().slice(0, 32);
    if (!cleanUsername) return;
    document.querySelectorAll("[data-user-name]").forEach((element) => {
      element.textContent = cleanUsername;
    });
    document.querySelectorAll("[data-user-initial]").forEach((element) => {
      element.textContent = cleanUsername.charAt(0).toUpperCase();
    });
    try {
      localStorage.setItem("550a-username", cleanUsername);
    } catch (error) {
      console.error("Unable to save the username locally:", error);
    }
    loginScreen.classList.add("hidden");
    desktop.removeAttribute("aria-hidden");
    if (typeof renderFolder === "function") {
      renderFolder(folderHistory[historyPosition], false);
    }
  }

  function finishStartup() {
    let savedUsername = "";
    try {
      savedUsername = localStorage.getItem("550a-username") || "";
    } catch (error) {
      console.error("Unable to read the saved username:", error);
    }
    startupScreen.classList.add("hidden");
    if (savedUsername) {
      applyUsername(savedUsername);
    } else {
      desktop.setAttribute("aria-hidden", "true");
      loginScreen.classList.remove("hidden");
      usernameInput.focus();
    }
  }

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    applyUsername(usernameInput.value);
  });

  window.setTimeout(() => {
    startupStatus.textContent = "Workspace ready";
    window.setTimeout(finishStartup, 350);
  }, 6000);

  const windows = new Map(
    [...document.querySelectorAll(".window")].map((element) => [
      element.dataset.window,
      element,
    ]),
  );

  /* Frequently-used nodes cached for the Files app. */
  const taskApps      = document.querySelector("#task-apps");
  const fileWindow    = windows.get("files");
  const fileAddress   = fileWindow.querySelector(".address-bar");
  const fileAddressForm = fileWindow.querySelector("#file-address-form");
  const fileAddressMessage = fileWindow.querySelector("#file-address-message");
  const currentFolder = fileWindow.querySelector(".current-folder");
  const fileGrid      = fileWindow.querySelector(".file-grid");
  const backButton    = fileWindow.querySelector('[data-file-action="back"]');
  const forwardButton = fileWindow.querySelector('[data-file-action="forward"]');

  /* Navigation history: an array of folder keys plus a cursor into it.
     Using a cursor (rather than push/pop) lets the Back/Forward buttons
     replay the exact path the user walked. */
  const folderHistory = ["home"];
  let historyPosition = 0;

  /* Every time a window is focused we bump this and assign it as z-index,
     which is the simplest way to bring a window to the front. */
  let zIndex = 4;

  /* -------------------------------------------------------------------------
     FILES APP — folder data
     Each entry is: [type, label, details, optionalTargetFolderKey]
     `type` chooses between folder-icon and file-icon in the renderer.
     ---------------------------------------------------------------------- */
  const musicLibrary = [
    ["ABBA - Lay All Your Love On Me (Official Lyric Video) - AbbaVEVO.mp3", 11227329],
    ["Amy Winehouse - Back To Black - AmyWinehouseVEVO.mp3", 9602993],
    ["Boney M - Rasputin (Lyrics) - 7clouds.mp3", 8832102],
    ["Feet Don't Fail Me Now (Live Acoustic Version) - Joy Crookes.mp3", 8250529],
    ["Gloria Gaynor - I Will Survive - GloriaGaynorVEVO.mp3", 7776114],
    ["grover washington jr - just the two of us (TikTok Remix) [Lyrics] - Blissful Mind.mp3", 10368146],
    ["Stephen Sanchez - Until I Found You (Official Video) - StephenSanchezVEVO.mp3", 7038858],
  ];

  const folders = {
    home: {
      label: "Home",
      items: [
        ["folder", "Documents", "12 items", "documents"],
        ["folder", "Downloads", "8 items",  "downloads"],
        ["folder", "Pictures",  "24 items", "pictures"],
        ["folder", "Projects",  "6 items",  "desktop"],
        ["file",   "Welcome.txt", "2 KB"],
        ["file",   "Roadmap.pdf", "1.4 MB"],
      ],
    },
    desktop: {
      label: "Desktop",
      items: [
        ["folder", "Projects", "6 items", "desktop"],
        ["file", "Welcome.txt", "2 KB"],
        ["file", "Roadmap.pdf", "1.4 MB"],
      ],
    },
    documents: {
      label: "Documents",
      items: [
        ["file", "Resume.docx", "48 KB"],
        ["file", "Notes.txt",   "6 KB"],
        ["file", "Roadmap.pdf", "1.4 MB"],
      ],
    },
    downloads: {
      label: "Downloads",
      items: [
        ["file", "Installer.zip",  "86 MB"],
        ["file", "Wallpaper.png",  "2.3 MB"],
      ],
    },
    pictures: {
      label: "Pictures",
      items: [
        ["file", "Wallpaper.png", "2.3 MB"],
        ["file", "Holiday.jpg",   "4.1 MB"],
      ],
    },
    music: {
      label: "Music",
      items: musicLibrary.map(([name, size]) => [
        "file",
        name,
        `${(size / 1048576).toFixed(1)} MB`,
      ]),
    },
    device: {
      label: "This device",
      items: [
        ["folder", "Local disk (C:)",  "128 GB", "home"],
        ["folder", "External drive (D:)","32 GB", "documents"],
      ],
    },
    network: {
      label: "Network",
      items: [
        ["folder", "Shared files", "12 items", "documents"],
        ["folder", "",             "Online",   "home"],
      ],
    },
  };

  function getCurrentUsername() {
    return document.querySelector("[data-user-name]")?.textContent.trim() || "Guest";
  }

  /* Enable/disable Back & Forward according to the history cursor. */
  function updateFileButtons() {
    backButton.disabled    = historyPosition === 0;
    forwardButton.disabled = historyPosition === folderHistory.length - 1;
  }

  /* Rebuild the sidebar / address bar / grid for a given folder.
     `addToHistory=false` is used when replaying Back/Forward so we don't
     push duplicate entries. */
  function renderFolder(folderName, addToHistory = true) {
    const folder = folders[folderName];
    if (!folder) return;   /* unknown folder key → silently ignore */

    if (addToHistory && folderHistory[historyPosition] !== folderName) {
      /* Drop any "forward" entries, then append the new one. */
      folderHistory.splice(historyPosition + 1);
      folderHistory.push(folderName);
      historyPosition += 1;
    }

    currentFolder.textContent = folder.label;
    const userFolderLabel = getCurrentUsername();
    fileAddress.value = folderName === "home"
      ? `Home / ${userFolderLabel}`
      : `Home / ${userFolderLabel} / ${folder.label}`;
    fileAddress.removeAttribute("aria-invalid");
    fileAddressMessage.textContent = "";

    /* Rebuild the card grid from scratch — cheap for the size of our data. */
    fileGrid.replaceChildren();

    folder.items.forEach(([type, itemLabel, details, target]) => {
      const label = folderName === "network" && !itemLabel
        ? `${userFolderLabel}/PC`
        : itemLabel;
      const card = document.createElement("button");
      card.className = "file-card";
      if (target) {
        card.dataset.folder = target;
        card.title = `Open ${label}`;
      }

      const icon     = document.createElement("span");
      icon.className = `icon ${type === "folder" ? "folder-icon" : "file-icon"}`;

      const name     = document.createElement("span");
      name.className = "file-card-name";
      name.textContent = label;

      const metadata = document.createElement("small");
      metadata.textContent = details;

      card.append(icon, name, metadata);

      /* Single-click selects; double-click opens (mirrors a real OS). */
      card.addEventListener("click", () => {
        fileGrid.querySelectorAll(".file-card").forEach((item) => {
          item.classList.toggle("selected", item === card);
        });
      });
      card.addEventListener("dblclick", () => {
        if (card.dataset.folder) navigateToFolder(card.dataset.folder);
      });

      fileGrid.append(card);
    });

    /* Sync sidebar active states.
       NOTE: the delegated click listener at the bottom of this file also
       handles .nav-item[data-folder] clicks, so we deliberately do NOT
       attach per-button onclick handlers here. */
    fileWindow.querySelectorAll(".nav-item[data-folder]").forEach((button) => {
      const isActive = button.dataset.folder === folderName;
      button.classList.toggle("active", isActive);
      button.toggleAttribute("aria-current", isActive);
    });

    updateFileButtons();
  }

  /* Navigate to a folder and bring the Files window forward. */
  function navigateToFolder(folderName) {
    if (!folders[folderName]) return;
    renderFolder(folderName);
    focusWindow("files");
  }

  function resolveFolderPath(path) {
    const segments = path.split(/[\\/]+/).map((segment) => segment.trim()).filter(Boolean);
    if (!segments.length) return null;

    let locationSegments = segments;
    if (segments[0].toLowerCase() === "home") {
      locationSegments = segments.slice(1);
      if (locationSegments[0]?.toLowerCase() === getCurrentUsername().toLowerCase()) {
        locationSegments = locationSegments.slice(1);
      }
    } else if (segments[0].toLowerCase() === getCurrentUsername().toLowerCase()) {
      locationSegments = segments.slice(1);
    }

    if (!locationSegments.length) return "home";
    if (locationSegments.length !== 1) return null;

    const requestedName = locationSegments[0].toLowerCase();
    const homeFolderAliases = folders.home.items
      .filter(([type, , , target]) => type === "folder" && target)
      .map(([, label, , target]) => [label.toLowerCase(), target]);
    const matchingAlias = homeFolderAliases.find(([label]) => label === requestedName);
    if (matchingAlias) return matchingAlias[1];

    const matchingFolder = Object.entries(folders).find(
      ([key, folder]) => key !== "home" && folder.label.toLowerCase() === requestedName,
    );
    return matchingFolder?.[0] ?? null;
  }

  fileAddressForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const requestedPath = fileAddress.value.trim();
    const folderName = resolveFolderPath(requestedPath);
    if (!folderName) {
      const pathSegments = requestedPath.split(/[\\/]+/).filter(Boolean);
      const name = pathSegments[pathSegments.length - 1] || "";
      const isFilePath = /\.[a-z0-9]{1,8}$/i.test(name);
      fileAddress.setAttribute("aria-invalid", "true");
      fileAddressMessage.textContent = isFilePath ? "file not found" : "folder not found";
      fileAddress.focus();
      return;
    }
    navigateToFolder(folderName);
  });

  fileAddress.addEventListener("input", () => {
    fileAddress.removeAttribute("aria-invalid");
    fileAddressMessage.textContent = "";
  });

  /* Initial paint — the Files app already lives in the DOM at load. */
  renderFolder("home", false);

  /* -------------------------------------------------------------------------
     WINDOW STATE — focus / close / open
     ---------------------------------------------------------------------- */

  /* Bring a window to the front.  Also updates the taskbar highlight and
     closes the Start menu. */
  function focusWindow(name) {
    const element = windows.get(name);
    if (!element) return;

    /* FIX (bug): previously we never removed `.focused` from other windows,
       so multiple windows could carry it and `toggleFullscreen()` could
       pick the wrong one. */
    windows.forEach((win) => win.classList.toggle("focused", win === element));

    element.classList.remove("hidden");
    element.style.zIndex = ++zIndex;

    document.querySelectorAll(".task-app").forEach((button) => {
      button.classList.toggle("active", button.dataset.app === name);
    });

    document.querySelector("#start-menu").classList.add("hidden");
  }

  /* Hide a window and remove its taskbar button. */
  function closeWindow(name) {
    const element = windows.get(name);
    if (!element) return;

    if (name === "music") {
      musicAudio.pause();
      musicAudio.currentTime = 0;
    }
    if (name === "terminal") {
      resetTerminal();
    }

    element.classList.add("hidden");
    element.classList.remove("focused");     /* FIX: clear stale focus */
    document.querySelector(`.task-app[data-app="${name}"]`)?.remove();
  }

  /* Minimise every open app while keeping its taskbar button available. */
  function minimizeAllWindows() {
    windows.forEach((element) => {
      element.classList.add("hidden");
      element.classList.remove("focused");
    });
    document.querySelectorAll(".task-app").forEach((button) =>
      button.classList.remove("active"),
    );
    document.querySelector("#start-menu").classList.add("hidden");
    document.querySelector("#search-panel").classList.add("hidden");
  }

  /* Lookup table for taskbar button labels — cleaner than a nested ternary. */
  const APP_LABELS = {
    files:      "Files",
    settings:   "Settings",
    calculator: "Calculator",
    calendar:   "Calendar",
    music:      "Music Player",
    terminal:   "Terminal",
    notes:      "Notes",
  };

  const APP_ICONS = {
    files: "img/1.webp",
    settings: "img/2.webp",
    calculator: "img/3.webp",
    calendar: "img/4.png",
    music: "img/th.jpeg",
    terminal: "img/111.jpeg",
  };

  /* Open an app and (on first open) create its taskbar button. */
  function openWindow(name) {
    focusWindow(name);
    if (document.querySelector(`.task-app[data-app="${name}"]`)) return;

    const button = document.createElement("button");
    button.className = "task-button task-app active";
    button.dataset.app = name;
    const iconPath = APP_ICONS[name];
    if (iconPath) {
      const icon = document.createElement("img");
      icon.src = iconPath;
      icon.alt = "";
      icon.setAttribute("aria-hidden", "true");
      button.append(icon);
    }
    button.append(document.createTextNode(APP_LABELS[name] ?? name));
    button.addEventListener("click", () => focusWindow(name));
    taskApps.append(button);
  }

  const terminalForm = document.querySelector("#terminal-form");
  const terminalInput = document.querySelector("#terminal-input");
  const terminalOutput = document.querySelector("#terminal-output");
  const terminalBody = document.querySelector("#terminal-body");
  let terminalHistory = [];
  let terminalHistoryIndex = 0;

  function terminalWrite(text, type = "") {
    const line = document.createElement("div");
    line.className = `terminal-line ${type}`.trim();
    line.textContent = text;
    terminalOutput.append(line);
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
  }

  function resetTerminal() {
    terminalHistory = [];
    terminalHistoryIndex = 0;
    terminalOutput.replaceChildren();
    terminalInput.value = "";
    terminalOutput.scrollTop = 0;
    terminalWrite("Welcome to 550A Terminal.");
  }

  function runTerminalCommand(rawCommand) {
    const command = rawCommand.trim();
    if (!command) return;
    terminalWrite(`550A> ${command}`, "command");
    const [name, ...args] = command.split(/\s+/);
    const normalized = name.toLowerCase();
    const argument = args.join(" ");
    const username = getCurrentUsername();

    if (normalized === "help") {
      terminalWrite("Available commands:");
      terminalWrite("  help       Show this command list");
      terminalWrite("  clear      Clear the terminal");
      terminalWrite("  dir / ls   List virtual folders and apps");
      terminalWrite("  ver        Show the 550A version");
      terminalWrite("  whoami     Show the current username");
      terminalWrite("  date       Show the current date and time");
      terminalWrite("  time       Show the current time");
      terminalWrite("  echo TEXT  Print text");
      terminalWrite("  pwd        Show the current virtual location");
      terminalWrite("  apps       List installed apps");
      terminalWrite("  open APP   Open an installed app");
      terminalWrite("  focus APP  Bring an app window to the front");
      terminalWrite("  minimize APP  Minimize an app window");
      terminalWrite("  close APP  Close an app window");
      terminalWrite("  theme NAME Set theme: midnight, light, or dim");
      terminalWrite("  volume 0-100 Set system volume");
      return;
    }
    if (normalized === "clear" || normalized === "cls") {
      terminalOutput.replaceChildren();
      return;
    }
    if (normalized === "dir" || normalized === "ls") {
      terminalWrite("Virtual folders: Home  Desktop  Documents  Downloads  Pictures  Music");
      terminalWrite(`Apps: ${Object.values(APP_LABELS).join(" | ")}`);
      return;
    }
    if (normalized === "ver") {
      terminalWrite("550A SERIES Terminal [Version 1.0.0]");
      return;
    }
    if (normalized === "whoami") {
      terminalWrite(username);
      return;
    }
    if (normalized === "date") {
      terminalWrite(new Date().toLocaleString());
      return;
    }
    if (normalized === "time") {
      terminalWrite(new Date().toLocaleTimeString());
      return;
    }
    if (normalized === "pwd") {
      terminalWrite(`C:\\550A\\${username}`);
      return;
    }
    if (normalized === "apps") {
      terminalWrite(Object.values(APP_LABELS).join("  ·  "));
      return;
    }
    if (normalized === "echo") {
      terminalWrite(argument);
      return;
    }
    if (normalized === "open") {
      const aliases = { files: "files", settings: "settings", notes: "notes", calculator: "calculator", calendar: "calendar", music: "music", terminal: "terminal" };
      const requestedApp = argument.toLowerCase().replace(/\s+/g, " ").trim();
      const app = aliases[requestedApp] || aliases[requestedApp.replace("music player", "music")] || aliases[requestedApp.replace("quick notes", "notes")];
      if (app) {
        openWindow(app);
        terminalWrite(`Opening ${APP_LABELS[app]}...`);
      } else {
        terminalWrite("App not found. Try: open files, settings, or music.", "error");
      }
      return;
    }
    if (normalized === "focus" || normalized === "minimize" || normalized === "close") {
      const aliases = { files: "files", settings: "settings", notes: "notes", calculator: "calculator", calendar: "calendar", music: "music", terminal: "terminal" };
      const requestedApp = argument.toLowerCase().replace(/\s+/g, " ").trim();
      const app = aliases[requestedApp] || aliases[requestedApp.replace("music player", "music")] || aliases[requestedApp.replace("quick notes", "notes")];
      if (!app) {
        terminalWrite("App not found. Try files, settings, music, or terminal.", "error");
        return;
      }
      if (normalized === "focus") {
        openWindow(app);
        terminalWrite(`Focused ${APP_LABELS[app]}.`);
      } else if (normalized === "minimize") {
        windows.get(app)?.classList.add("hidden");
        windows.get(app)?.classList.remove("focused");
        terminalWrite(`Minimized ${APP_LABELS[app]}.`);
      } else {
        closeWindow(app);
        terminalWrite(`Closed ${APP_LABELS[app]}.`);
      }
      return;
    }
    if (normalized === "theme") {
      const themes = ["midnight", "light", "dim"];
      if (!themes.includes(argument.toLowerCase())) {
        terminalWrite("Theme must be midnight, light, or dim.", "error");
        return;
      }
      settingsTheme.value = argument.toLowerCase();
      applySettingsTheme(settingsTheme.value);
      terminalWrite(`Theme changed to ${settingsTheme.value}.`);
      return;
    }
    if (normalized === "volume") {
      const percent = Number(argument);
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        terminalWrite("Volume must be a number from 0 to 100.", "error");
        return;
      }
      soundSlider.value = String(percent / 100);
      updateSoundControls();
      document.querySelector("#music-volume").value = soundSlider.value;
      terminalWrite(`System volume set to ${percent}%.`);
      return;
    }
    terminalWrite(`'${name}' is not recognized. Type 'help' for available commands.`, "error");
  }

  terminalForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const command = terminalInput.value;
    if (command.trim()) {
      terminalHistory.push(command);
      terminalHistoryIndex = terminalHistory.length;
      runTerminalCommand(command);
    }
    terminalInput.value = "";
  });
  terminalInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      terminalHistoryIndex = Math.max(0, terminalHistoryIndex - 1);
      terminalInput.value = terminalHistory[terminalHistoryIndex] || "";
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      terminalHistoryIndex = Math.min(terminalHistory.length, terminalHistoryIndex + 1);
      terminalInput.value = terminalHistory[terminalHistoryIndex] || "";
    }
  });
  windows.get("terminal")?.addEventListener("transitionend", () => terminalInput.focus());
  resetTerminal();

  /* -------------------------------------------------------------------------
     GLOBAL CLICK DELEGATION
     One listener handles every [data-open], [data-close], [data-minimize],
     [data-maximize], [data-folder] and [data-file-action] in the shell.
     ---------------------------------------------------------------------- */
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;

    const open        = event.target.closest("[data-open]");
    const close       = event.target.closest("[data-close]");
    const minimize    = event.target.closest("[data-minimize]");
    const maximize    = event.target.closest("[data-maximize]");
    const folderBtn   = event.target.closest("[data-folder]");
    const fileAction  = event.target.closest("[data-file-action]");

    /* Desktop icons select on single-click; double-click opens (below). */
    if (open) {
      if (open.closest(".desktop-icon")) {
        document.querySelectorAll(".desktop-icon").forEach((icon) => {
          icon.classList.toggle("selected", icon === open);
        });
        return;
      }
      openWindow(open.dataset.open);
      return;
    }

    if (close)    { closeWindow(close.dataset.close); return; }

    if (minimize) {
      const el = windows.get(minimize.dataset.minimize);
      el?.classList.add("hidden");
      el?.classList.remove("focused");
      return;
    }

    if (maximize) {
      windows.get(maximize.dataset.maximize)?.classList.toggle("maximized");
      return;
    }

    /* Sidebar folder navigation inside the Files app. */
    if (folderBtn && fileWindow.contains(folderBtn) &&
        folderBtn.classList.contains("nav-item")) {
      navigateToFolder(folderBtn.dataset.folder);
      return;
    }

    /* Back / Forward buttons. */
    if (fileAction && fileWindow.contains(fileAction)) {
      if (fileAction.dataset.fileAction === "back" && historyPosition > 0) {
        historyPosition -= 1;
        renderFolder(folderHistory[historyPosition], false);
      }
      if (fileAction.dataset.fileAction === "forward" &&
          historyPosition < folderHistory.length - 1) {
        historyPosition += 1;
        renderFolder(folderHistory[historyPosition], false);
      }
      return;
    }

    /* Clicking anywhere on a window body brings it to the front. */
    const windowElement = event.target.closest(".window");
    if (windowElement) focusWindow(windowElement.dataset.window);
  });

  /* Desktop icons also open on double-click. */
  document.querySelectorAll(".desktop-icon").forEach((icon) => {
    icon.addEventListener("dblclick", () => openWindow(icon.dataset.open));
  });

  /* A click on the empty desktop surface minimises all open app windows. */
  desktop.addEventListener("click", (event) => {
    if (event.target === desktop) minimizeAllWindows();
  });

  /* -------------------------------------------------------------------------
     TASKBAR LAUNCHERS
     ---------------------------------------------------------------------- */

  const startMenu = document.querySelector("#start-menu");
  const searchPanel = document.querySelector("#search-panel");
  const globalSearch = document.querySelector("#global-search");
  const globalSearchMessage = document.querySelector("#global-search-message");
  const globalSearchResults = document.querySelector("#global-search-results");

  document.querySelector("#start-button").addEventListener("click", () => {
    startMenu.classList.toggle("hidden");
    searchPanel.classList.add("hidden");
  });

  document.querySelector("#search-button").addEventListener("click", () => {
    const isOpening = searchPanel.classList.contains("hidden");
    searchPanel.classList.toggle("hidden");
    startMenu.classList.add("hidden");
    if (isOpening) globalSearch.focus();
  });

  function renderGlobalSearchResults() {
    const normalizeSearchText = (value) =>
      value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
    const query = normalizeSearchText(globalSearch.value.trim());
    globalSearchResults.replaceChildren();

    if (!query) {
      globalSearchMessage.textContent = "Try searching for an app, file, or setting.";
      return;
    }

    const searchItems = [
      ...Object.entries(APP_LABELS).map(([app, label]) => ({
        label,
        description: "App",
        type: "app",
        target: app,
        keywords: label,
      })),
      ...Object.entries(folders).flatMap(([folderKey, folder]) => [
        {
          label: folder.label,
          description: "Folder · Files",
          type: "folder",
          target: folderKey,
          keywords: `${folder.label} files`,
        },
        ...folder.items.map(([type, label, , targetFolder]) => ({
          label,
          description: `${type === "folder" ? "Folder" : "File"} · Files`,
          type: type === "folder" ? "folder" : "file",
          target: type === "folder" ? targetFolder : folderKey,
          keywords: `${label} ${folder.label} files`,
        })),
      ]),
      ...[...document.querySelectorAll(".settings-item")].map((button) => ({
        label: button.textContent.trim(),
        description: "Settings",
        type: "setting",
        target: button.dataset.settingsPage,
        keywords: `${button.textContent} ${
          button.dataset.settingsPage === "network" ? "Wi-Fi 550A connection" : ""
        }`,
      })),
    ];

    const matches = searchItems
      .filter((item, index, items) =>
        normalizeSearchText(item.keywords).includes(query) &&
        items.findIndex((candidate) =>
          candidate.type === item.type &&
          candidate.label.toLocaleLowerCase() === item.label.toLocaleLowerCase(),
        ) === index,
      )
      .slice(0, 12);

    globalSearchMessage.textContent = matches.length
      ? "Search results"
      : `No results found for “${globalSearch.value.trim()}”.`;

    matches.forEach((item) => {
      const result = document.createElement("button");
      result.type = "button";
      result.className = "search-result";
      result.dataset.searchType = item.type;
      result.dataset.searchTarget = item.target;

      const label = document.createElement("span");
      label.textContent = item.label;
      const description = document.createElement("small");
      description.textContent = item.description;
      result.append(label, description);
      globalSearchResults.append(result);
    });
  }

  globalSearch.addEventListener("input", renderGlobalSearchResults);
  globalSearchResults.addEventListener("click", (event) => {
    const result = event.target.closest(".search-result");
    if (!result) return;

    const { searchType, searchTarget } = result.dataset;
    if (searchType === "app") {
      openWindow(searchTarget);
    } else if (searchType === "folder" || searchType === "file") {
      openWindow("files");
      navigateToFolder(searchTarget);
    } else if (searchType === "setting") {
      openWindow("settings");
      document
        .querySelector(`.settings-item[data-settings-page="${searchTarget}"]`)
        ?.click();
    }
    searchPanel.classList.add("hidden");
  });

  searchPanel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      searchPanel.classList.add("hidden");
      document.querySelector("#search-button").focus();
    }
  });

  /* Show-desktop: hide every window and clear stale taskbar/focus states. */
  document.querySelector("#show-desktop").addEventListener("click", () => {
    minimizeAllWindows();
  });

  /* -------------------------------------------------------------------------
     CALCULATOR STATE + HELPERS
     ---------------------------------------------------------------------- */
  const calculator = {
    display:         document.querySelector("#calculator-display"),
    expression:      document.querySelector("#calculator-expression"),
    value:           "0",      /* what's currently on the display         */
    storedValue:     null,     /* left operand of a pending operation     */
    operation:       null,     /* "add" | "subtract" | "multiply" | "divide" */
    waitingForValue: false,    /* true when the next digit starts a new value */
    justCalculated:  false,    /* true immediately after "=" */
  };
  const calculatorHistory = document.querySelector("#calculator-history-list");

  /* Render a finite number with 12 significant digits, grouped. */
  function formatCalculatorValue(value) {
    if (!Number.isFinite(value)) return "Error";
    return Number(value.toPrecision(12)).toLocaleString("en-US", {
      maximumFractionDigits: 10,
    });
  }

  function updateCalculatorDisplay() {
    calculator.display.textContent = calculator.value;
  }

  /* Add an entry to the history list; clicking recalls its result. */
  function addCalculatorHistory(label, result) {
    /* Remove the placeholder "Your calculations will appear here." */
    if (calculatorHistory.querySelector(".muted")) {
      calculatorHistory.replaceChildren();
    }
    const item = document.createElement("button");
    item.className = "history-item";
    item.type = "button";
    item.innerHTML = `<span>${label}</span><strong>${result}</strong>`;
    item.addEventListener("click", () => {
      calculator.value = result.replace(/,/g, "");
      calculator.justCalculated = true;
      updateCalculatorDisplay();
    });
    calculatorHistory.prepend(item);
  }

  /* Reset every piece of calculator state. */
  function clearCalculator() {
    calculator.value = "0";
    calculator.storedValue = null;
    calculator.operation = null;
    calculator.waitingForValue = false;
    calculator.justCalculated = false;
    calculator.expression.textContent = "";
    updateCalculatorDisplay();
  }

  /* Append a digit to the display (or start a fresh value if waiting). */
  function inputCalculatorNumber(number) {
    if (
      calculator.waitingForValue ||
      calculator.justCalculated ||
      calculator.value === "Error" ||
      calculator.value === "Enter valid values"
    ) {
      calculator.value = number;
      calculator.waitingForValue = false;
      calculator.justCalculated = false;
    } else {
      calculator.value =
        calculator.value === "0" ? number : calculator.value + number;
    }
    updateCalculatorDisplay();
  }

  /* Insert a decimal point, avoiding duplicates. */
  function inputCalculatorDecimal() {
    if (calculator.waitingForValue || calculator.justCalculated) {
      calculator.value = "0.";
      calculator.waitingForValue = false;
      calculator.justCalculated = false;
    } else if (!calculator.value.includes(".")) {
      calculator.value += ".";
    }
    updateCalculatorDisplay();
  }

  /* Pure arithmetic — kept separate so it can be reused by both the button
     handler and the keyboard handler. */
  function performCalculation(first, second, operation) {
    if (operation === "add")      return first + second;
    if (operation === "subtract") return first - second;
    if (operation === "multiply") return first * second;
    if (operation === "divide")   return second === 0 ? NaN : first / second;
    return second;
  }

  /* Choose the pending operation.  If a previous op is pending and the user
     hasn't started a new value, evaluate it first (chained calculations). */
  function chooseCalculatorOperation(operation) {
    if (!Number.isFinite(Number(calculator.value))) clearCalculator();

    const inputValue = Number(calculator.value);
    if (calculator.operation && calculator.storedValue !== null &&
        !calculator.waitingForValue) {
      const result = performCalculation(
        calculator.storedValue, inputValue, calculator.operation,
      );
      calculator.value = formatCalculatorValue(result);
      calculator.storedValue = result;
    } else {
      calculator.storedValue = inputValue;
    }

    calculator.operation = operation;
    calculator.waitingForValue = true;
    calculator.justCalculated = false;

    /* Show the operator in the tiny expression line. */
    const symbol = operation === "add"      ? "+"
                 : operation === "subtract" ? "−"
                 : operation === "multiply" ? "×"
                 :                            "÷";
    calculator.expression.textContent =
      `${formatCalculatorValue(calculator.storedValue)} ${symbol}`;
    updateCalculatorDisplay();
  }

  /* Evaluate the pending operation and commit it to history. */
  function calculateResult() {
    if (!calculator.operation || calculator.storedValue === null) return;

    const first  = calculator.storedValue;
    const second = Number(calculator.value);
    const result = performCalculation(first, second, calculator.operation);

    /* Build a human-readable "6 + 7" style label from the current expression. */
    const symbol = calculator.expression.textContent.slice(-1);
    const label  = `${formatCalculatorValue(first)} ${symbol} ${formatCalculatorValue(second)}`;

    calculator.value = formatCalculatorValue(result);
    calculator.expression.textContent = "";
    calculator.storedValue = null;
    calculator.operation = null;
    calculator.waitingForValue = false;
    calculator.justCalculated = true;

    updateCalculatorDisplay();
    addCalculatorHistory(label, calculator.value);
  }

  /* Scientific one-argument functions.  Angles are in degrees (sin/cos/tan). */
  function applyScientificFunction(action) {
    const currentValue = Number(calculator.value);
    if (!Number.isFinite(currentValue)) { clearCalculator(); return; }

    let result;
    let label = action;

    switch (action) {
      case "sin":
        result = Math.sin((currentValue * Math.PI) / 180); break;
      case "cos":
        result = Math.cos((currentValue * Math.PI) / 180); break;
      case "tan":
        result = Math.tan((currentValue * Math.PI) / 180); break;
      case "sqrt":
        if (currentValue < 0) {
          calculator.value = "Error"; updateCalculatorDisplay(); return;
        }
        result = Math.sqrt(currentValue); label = "√"; break;
      case "square":
        result = currentValue ** 2; label = "square"; break;
      case "cube":
        result = currentValue ** 3; label = "cube"; break;
      case "log":
        if (currentValue <= 0) {
          calculator.value = "Error"; updateCalculatorDisplay(); return;
        }
        result = Math.log10(currentValue); label = "log"; break;
      case "ln":
        if (currentValue <= 0) {
          calculator.value = "Error"; updateCalculatorDisplay(); return;
        }
        result = Math.log(currentValue); label = "ln"; break;
      case "exp":
        result = Math.exp(currentValue); label = "exp"; break;
      case "reciprocal":
        if (currentValue === 0) {
          calculator.value = "Error"; updateCalculatorDisplay(); return;
        }
        result = 1 / currentValue; label = "1/x"; break;
      case "toggle-sign":
        result = -currentValue; label = "negate"; break;
      case "abs":
        result = Math.abs(currentValue); label = "abs"; break;
      case "percent":
        result = currentValue / 100; label = "%"; break;
      default:
        return;   /* unknown action → no-op */
    }

    calculator.value = formatCalculatorValue(result);
    calculator.expression.textContent =
      `${label}(${formatCalculatorValue(currentValue)})`;
    calculator.justCalculated = true;

    updateCalculatorDisplay();
    addCalculatorHistory(
      `${label}(${formatCalculatorValue(currentValue)})`,
      calculator.value,
    );
  }

  /* -------------------------------------------------------------------------
     CALCULATOR EVENT WIRING
     ---------------------------------------------------------------------- */

  /* Basic keypad: number / operator / action buttons. */
  document.querySelector("#basic-keypad").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;

    if (button.dataset.calcNumber)    inputCalculatorNumber(button.dataset.calcNumber);
    if (button.dataset.calcOperation) chooseCalculatorOperation(button.dataset.calcOperation);

    switch (button.dataset.calcAction) {
      case "decimal": inputCalculatorDecimal(); break;
      case "clear":   clearCalculator();        break;
      case "delete":
        calculator.value = calculator.value.length > 1
          ? calculator.value.slice(0, -1) : "0";
        updateCalculatorDisplay();
        break;
      case "percent":
        calculator.value = formatCalculatorValue(Number(calculator.value) / 100);
        updateCalculatorDisplay();
        break;
      case "equals": calculateResult(); break;
    }
  });

  /* Scientific keypad: shares the digit/operator handlers, adds sci actions. */
  document.querySelector("#scientific-keypad").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;

    if (button.dataset.calcNumber)    inputCalculatorNumber(button.dataset.calcNumber);
    if (button.dataset.calcOperation) chooseCalculatorOperation(button.dataset.calcOperation);

    switch (button.dataset.calcAction) {
      case "decimal": inputCalculatorDecimal(); break;
      case "clear":   clearCalculator();        break;
      case "delete":
        calculator.value = calculator.value.length > 1
          ? calculator.value.slice(0, -1) : "0";
        updateCalculatorDisplay();
        break;
      case "equals": calculateResult(); break;
    }

    if (button.dataset.scientificAction) {
      applyScientificFunction(button.dataset.scientificAction);
      return;
    }

    if (button.dataset.scientificConstant === "pi") {
      calculator.value = formatCalculatorValue(Math.PI);
      calculator.justCalculated = true;
      calculator.expression.textContent = "π";
      updateCalculatorDisplay();
      return;
    }
    if (button.dataset.scientificConstant === "e") {
      calculator.value = formatCalculatorValue(Math.E);
      calculator.justCalculated = true;
      calculator.expression.textContent = "e";
      updateCalculatorDisplay();
    }
  });

  /* Mode tabs (Basic / Scientific). */
  document.querySelectorAll("[data-calc-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode          = button.dataset.calcMode;
      const isSciMode     = mode === "scientific";

      document.querySelectorAll("[data-calc-mode]").forEach((tab) => {
        tab.classList.toggle("active", tab === button);
        tab.setAttribute("aria-selected", tab === button ? "true" : "false");
      });

      document.querySelector("#basic-keypad").classList.toggle("hidden", isSciMode);
      document.querySelector("#scientific-keypad").classList.toggle("hidden", !isSciMode);

      clearCalculator();
    });
  });

  document.querySelector("#clear-calculator-history").addEventListener("click", () => {
    calculatorHistory.innerHTML =
      '<p class="muted">Your calculations will appear here.</p>';
  });

  /* -------------------------------------------------------------------------
     SETTINGS APP
     ---------------------------------------------------------------------- */
  const settingsNavButtons             = document.querySelectorAll(".settings-item");
  const settingsPages                  = document.querySelectorAll(".settings-page");
  const settingsTheme                  = document.querySelector("#settings-theme");
  const settingsAccent                 = document.querySelector("#settings-accent");
  const settingsAnimations             = document.querySelector("#settings-animations");
  const settingsWindowTransparency     = document.querySelector("#settings-window-transparency");
  const settingsBrightness             = document.querySelector("#settings-brightness");
  const settingsBrightnessValue        = document.querySelector("#settings-brightness-value");
  const settingsSoundVolume            = document.querySelector("#settings-sound-volume");
  const settingsSoundValue             = document.querySelector("#settings-sound-value");
  const settingsBackgroundCharacter    = document.querySelector("#settings-background-character");
  const settingsBackgroundStatus       = document.querySelector("#settings-background-status");
  const settingsBackgroundReset        = document.querySelector("#settings-background-reset");
  let backgroundCharacterUrl = "";

  /* Push a transparency value (50–100) into the per-window alpha tokens.
     Invalid input falls back to the opaque end of the supported range so
     a malformed slider event cannot write `NaN` into the stylesheet. */
  function applyWindowTransparency(value) {
    const numericValue = Number(value);
    const clampedValue = Number.isFinite(numericValue)
      ? Math.min(Math.max(numericValue, 50), 100)
      : 100;
    const alpha        = clampedValue / 100;

    document.querySelectorAll(".window").forEach((element) => {
      element.style.setProperty("--window-surface-alpha", String(alpha));
      element.style.setProperty("--window-header-alpha", String(alpha * 0.85));
      element.style.setProperty("--window-border-alpha", String(alpha * 0.55));
    });
  }

  function applyBackgroundCharacter() {
    desktop.style.backgroundImage = `url("${backgroundCharacterUrl}")`;
    desktop.style.backgroundPosition = "center";
    desktop.style.backgroundSize = "cover";
    desktop.style.backgroundRepeat = "no-repeat";
  }

  /* Swap the desktop background between the three preset themes.
     Midnight restores the wallpaper; the other presets use a plain gradient
     so their light and dim surfaces remain readable. */
  function applySettingsTheme(theme) {
    const root = document.documentElement;

    const themes = {
      midnight: { background: "#101724", panel: "#162235" },
      light:    { background: "#eaf1fb", panel: "#ffffff" },
      dim:      { background: "#212936", panel: "#2a3547" },
    };
    const selected = themes[theme] || themes.midnight;

    root.style.setProperty("--accent-color",
      settingsAccent.value || "#79a9ff");

    if (theme === "midnight") {
      if (backgroundCharacterUrl) {
        applyBackgroundCharacter();
      } else {
        desktop.style.background = "";
      }
      desktop.classList.remove("theme-customized");
    } else {
      desktop.style.background =
        `linear-gradient(135deg, ${selected.background}, ${selected.panel} 60%, ${selected.background})`;
      desktop.classList.add("theme-customized");
    }
  }

  /* Show one settings page and hide the rest. */
  function setActiveSettingsPage(page) {
    settingsNavButtons.forEach((button) => {
      const active = button.dataset.settingsPage === page;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    settingsPages.forEach((section) => {
      section.classList.toggle("hidden", section.dataset.settingsPage !== page);
    });
  }

  settingsNavButtons.forEach((button) => {
    button.addEventListener("click", () =>
      setActiveSettingsPage(button.dataset.settingsPage));
  });

  /* Keep the shared CSS token in sync so dynamically created controls match. */
  function syncAccentColors() {
    const accent = settingsAccent.value;
    document.documentElement.style.setProperty("--accent-color", accent);
  }

  settingsTheme.addEventListener("change", (event) => {
    applySettingsTheme(event.target.value);
  });

  settingsAccent.addEventListener("input", () => {
    syncAccentColors();
    applySettingsTheme(settingsTheme.value);
  });

  /* Toggle transitions globally so the setting applies consistently to
     controls and app surfaces that are added after startup. */
  settingsAnimations.addEventListener("change", (event) => {
    const speed = event.target.checked ? "0.22s" : "0s";
    document.documentElement.style.setProperty("--animation-speed", speed);
    document.querySelectorAll("*").forEach((element) => {
      element.style.transitionDuration = speed;
    });
  });

  if (settingsWindowTransparency) {
    settingsWindowTransparency.addEventListener("input", (event) => {
      const value = Math.min(Math.max(Number(event.target.value), 50), 100);
      event.target.value = String(value);
      applyWindowTransparency(value);
    });
  }

  function applyDisplayBrightness(value) {
    const brightness = Math.min(Math.max(Number(value), 50), 100);
    const dimness = ((100 - brightness) / 50) * 0.32;
    document.documentElement.style.setProperty("--display-dimness", String(dimness));
    settingsBrightness.value = String(brightness);
    settingsBrightnessValue.value = `${brightness}%`;
  }

  settingsBrightness.addEventListener("input", (event) => {
    applyDisplayBrightness(event.target.value);
  });

  settingsSoundVolume.addEventListener("input", (event) => {
    soundSlider.value = event.target.value;
    updateSoundControls();
    settingsSoundValue.value = `${Math.round(Number(event.target.value) * 100)}%`;
  });

  settingsBackgroundCharacter.addEventListener("change", (event) => {
    const [file] = event.target.files;
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      settingsBackgroundStatus.textContent = "Choose a valid image file.";
      settingsBackgroundCharacter.value = "";
      return;
    }

    let nextUrl;
    try {
      nextUrl = URL.createObjectURL(file);
    } catch (error) {
      console.error("Unable to load the selected background image:", error);
      settingsBackgroundStatus.textContent = "Unable to load this image.";
      return;
    }
    if (backgroundCharacterUrl) URL.revokeObjectURL(backgroundCharacterUrl);
    backgroundCharacterUrl = nextUrl;
    settingsBackgroundStatus.textContent = file.name;
    if (settingsTheme.value === "midnight") {
      applyBackgroundCharacter();
    }
  });

  settingsBackgroundReset.addEventListener("click", () => {
    if (backgroundCharacterUrl) URL.revokeObjectURL(backgroundCharacterUrl);
    backgroundCharacterUrl = "";
    settingsBackgroundCharacter.value = "";
    settingsBackgroundStatus.textContent = "Using the 550A background";
    applySettingsTheme(settingsTheme.value);
  });

  /* Apply initial defaults so the UI matches the HTML on first paint. */
  setActiveSettingsPage("system");
  applySettingsTheme(settingsTheme.value);
  syncAccentColors();
  applyWindowTransparency(settingsWindowTransparency?.value ?? 85);
  applyDisplayBrightness(settingsBrightness.value);

  /* -------------------------------------------------------------------------
     MUSIC PLAYER
     ---------------------------------------------------------------------- */

  let musicFiles = musicLibrary.map(([name]) => name);
  /* Keep bundled tracks in the sibling music folder. */
  const musicDirectoryUrl = new URL(
    "./music/",
    document.currentScript?.src || document.baseURI,
  );

  const musicAudio       = document.querySelector("#music-audio");
  const musicTitle       = document.querySelector("#music-title");
  const musicFormat      = document.querySelector("#music-format");
  const musicSeek        = document.querySelector("#music-seek");
  const musicCurrentTime = document.querySelector("#music-current-time");
  const musicDuration    = document.querySelector("#music-duration");
  const musicPlay        = document.querySelector("#music-play");
  const musicTrackList   = document.querySelector("#music-track-list");
  const musicCount       = document.querySelector("#music-count");

  const musicState = { index: 0, shuffle: false, repeat: false };
  const customMusicSources = new Map();

  /* Guard so that a slow file read doesn't overwrite a later track choice. */
  let musicLoadRequest = 0;

  /* "125.4" → "2:05" */
  function formatMusicTime(seconds) {
    if (!Number.isFinite(seconds)) return "0:00";
    return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  }

  /* Rebuild the playlist sidebar from `musicFiles`. */
  function renderMusicTracks() {
    musicTrackList.replaceChildren();
    musicCount.textContent = `${musicFiles.length} songs`;

    musicFiles.forEach((file, index) => {
      const track = document.createElement("button");
      track.type = "button";
      track.className = "music-track";
      track.dataset.trackIndex = String(index);

      const number = document.createElement("span");
      number.className = "music-track-number";
      number.textContent = String(index + 1);

      const title = document.createElement("span");
      title.className = "music-track-name";
      title.textContent = file.replace(/\.[^.]+$/, "");  /* drop the extension */
      title.title = file;

      track.append(number, title);
      track.addEventListener("click", () => loadMusicTrack(index, true));
      musicTrackList.append(track);
    });
  }

  /* Load (and optionally play) a track by index.  The index wraps so
     Previous on the first track goes to the last one. */
  async function loadMusicTrack(index, startPlayback = false) {
    musicState.index = (index + musicFiles.length) % musicFiles.length;
    const file = musicFiles[musicState.index];
    const requestId = ++musicLoadRequest;

    musicTitle.textContent = file.replace(/\.[^.]+$/, "");
    musicFormat.textContent = `${file.split(".").pop().toUpperCase()} · ${
      customMusicSources.has(musicState.index) ? "Selected file" : "Bundled file"
    }`;

    musicTrackList.querySelectorAll(".music-track").forEach((track) => {
      track.classList.toggle(
        "active",
        Number(track.dataset.trackIndex) === musicState.index,
      );
    });

    try {
      const customSource = customMusicSources.get(musicState.index);
      const source = customSource
        || new URL(encodeURIComponent(file), musicDirectoryUrl).href;

      /* Let the browser load the track URL directly, like the reference player. */
      musicAudio.src = source;
      musicAudio.load();
      if (startPlayback) await musicAudio.play();
    } catch (error) {
      if (requestId === musicLoadRequest) {
        musicFormat.textContent = "Unable to load this music file";
        console.error("Unable to load selected music track:", error);
      }
    }
  }

  /* Advance to the next track (random if shuffle is on). */
  function playNextMusicTrack() {
    const nextIndex = musicState.shuffle
      ? Math.floor(Math.random() * musicFiles.length)
      : musicState.index + 1;
    loadMusicTrack(nextIndex, true);
  }

  renderMusicTracks();
  loadMusicTrack(0);
  musicAudio.volume = 0.85;

  document.querySelector("#music-file-picker").addEventListener("change", (event) => {
    const selectedFiles = [...event.target.files].filter((file) => file.type.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(file.name));
    if (!selectedFiles.length) return;

    const firstAddedIndex = musicFiles.length;
    selectedFiles.forEach((file, offset) => {
      const index = firstAddedIndex + offset;
      musicFiles.push(file.name);
      customMusicSources.set(index, URL.createObjectURL(file));
    });
    renderMusicTracks();
    loadMusicTrack(firstAddedIndex, true);
    event.target.value = "";
  });

  /* Toggle play/pause on the transport button. */
  musicPlay.addEventListener("click", () => {
    if (musicAudio.paused) {
      musicAudio.play().catch((error) => console.error("Unable to play music:", error));
    } else {
      musicAudio.pause();
    }
  });

  document.querySelector("#music-previous").addEventListener("click", () => {
    loadMusicTrack(musicState.index - 1, true);
  });
  document.querySelector("#music-next").addEventListener("click", playNextMusicTrack);

  document.querySelector("#music-shuffle").addEventListener("click", (event) => {
    musicState.shuffle = !musicState.shuffle;
    event.currentTarget.setAttribute("aria-pressed", String(musicState.shuffle));
  });

  document.querySelector("#music-repeat").addEventListener("click", (event) => {
    musicState.repeat = !musicState.repeat;
    event.currentTarget.setAttribute("aria-pressed", String(musicState.repeat));
  });

  /* Music-player volume — keeps the taskbar fly-out slider in sync. */
  document.querySelector("#music-volume").addEventListener("input", (event) => {
    const value = Number(event.target.value);
    musicAudio.volume = value;
    soundSlider.value = event.target.value;
    if (value > 0) soundBeforeMute = value;
    updateSoundControls();
  });

  /* Seek bar wiring. */
  musicSeek.addEventListener("input", () => {
    musicAudio.currentTime = Number(musicSeek.value);
  });

  musicAudio.addEventListener("loadedmetadata", () => {
    musicSeek.max = String(musicAudio.duration);
    musicDuration.textContent = formatMusicTime(musicAudio.duration);
  });

  musicAudio.addEventListener("error", () => {
    if (musicAudio.src) {
      const errorCode = musicAudio.error?.code;
      musicFormat.textContent = "Unable to load this music file";
      console.error("Unable to load the selected music file:", {
        source: musicAudio.currentSrc || musicAudio.src,
        mediaErrorCode: errorCode,
      });
    }
  });

  musicAudio.addEventListener("timeupdate", () => {
    musicSeek.value = String(musicAudio.currentTime);
    musicCurrentTime.textContent = formatMusicTime(musicAudio.currentTime);
  });

  /* Flip the transport glyph between ▶ and ❚❚ as the audio element plays. */
  musicAudio.addEventListener("play", () => {
    musicPlay.textContent = "❚❚";
    musicPlay.title = "Pause";
  });
  musicAudio.addEventListener("pause", () => {
    musicPlay.textContent = "▶";
    musicPlay.title = "Play";
  });

  /* On natural end: repeat the current track or advance. */
  musicAudio.addEventListener("ended", () => {
    if (musicState.repeat) {
      musicAudio.currentTime = 0;
      musicAudio.play().catch((error) => console.error("Unable to repeat music:", error));
    } else {
      playNextMusicTrack();
    }
  });

  /* -------------------------------------------------------------------------
     TASKBAR STATUS FLY-OUTS
     Wi-Fi and sound panels; sound shares state with the music-player slider.
     ---------------------------------------------------------------------- */
  const wifiButton = document.querySelector("#wifi-button");
  const wifiFlyout = document.querySelector("#wifi-flyout");

  wifiButton.addEventListener("click", (event) => {
    event.stopPropagation();
    wifiFlyout.classList.toggle("hidden");
    wifiButton.setAttribute(
      "aria-expanded",
      String(!wifiFlyout.classList.contains("hidden")),
    );
  });

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element) ||
        !event.target.closest(".wifi-control")) {
      wifiFlyout.classList.add("hidden");
      wifiButton.setAttribute("aria-expanded", "false");
    }
  });

  const soundButton = document.querySelector("#sound-button");
  const soundFlyout = document.querySelector("#sound-flyout");
  const soundMute   = document.querySelector("#sound-mute");
  const soundSlider = document.querySelector("#sound-slider");
  const soundLevel  = document.querySelector("#sound-level");

  /* Remember the last non-zero volume so Mute can restore it. */
  let soundBeforeMute = Number(soundSlider.value);

  /* Push current slider value into audio element, label and icons. */
  function updateSoundControls() {
    const volume = Number(soundSlider.value);
    musicAudio.volume = volume;
    soundLevel.textContent = `${Math.round(volume * 100)}%`;
    settingsSoundVolume.value = soundSlider.value;
    settingsSoundValue.value = `${Math.round(volume * 100)}%`;
    soundMute.textContent = volume === 0 ? "🔇" : "🔊";
    soundMute.setAttribute("aria-label", volume === 0 ? "Unmute sound" : "Mute sound");
    soundButton.textContent = volume === 0 ? "🔇" : "🔊";
  }

  soundButton.addEventListener("click", (event) => {
    /* Stop propagation so the outside-click closer below doesn't immediately
       re-hide the fly-out we just opened. */
    event.stopPropagation();
    soundFlyout.classList.toggle("hidden");
    soundButton.setAttribute(
      "aria-expanded",
      String(!soundFlyout.classList.contains("hidden")),
    );
  });

  soundSlider.addEventListener("input", () => {
    if (Number(soundSlider.value) > 0) soundBeforeMute = Number(soundSlider.value);
    document.querySelector("#music-volume").value = soundSlider.value;
    updateSoundControls();
  });

  soundMute.addEventListener("click", () => {
    if (Number(soundSlider.value) === 0) {
      soundSlider.value = String(soundBeforeMute || 0.85);
    } else {
      soundBeforeMute = Number(soundSlider.value);
      soundSlider.value = "0";
    }
    updateSoundControls();
  });

  /* Click anywhere outside the sound control closes the fly-out. */
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".sound-control")) {
      soundFlyout.classList.add("hidden");
      soundButton.setAttribute("aria-expanded", "false");
    }
  });

  updateSoundControls();

  /* -------------------------------------------------------------------------
     CALENDAR APP
     ---------------------------------------------------------------------- */
  const calendarState = {
    date:     new Date(),   /* which month the grid shows        */
    selected: new Date(),   /* which day the details panel shows */
    events:   {},           /* { "YYYY-MM-DD": [ { title, time } ] } */
  };

  const calendarGrid         = document.querySelector("#calendar-grid");
  const calendarMonthSelect  = document.querySelector("#calendar-month-select");
  const calendarYearSelect   = document.querySelector("#calendar-year-select");
  const calendarSelectedLbl  = document.querySelector("#calendar-selected-label");
  const calendarEvents       = document.querySelector("#calendar-events");

  /* Turn a Date into the object key used by calendarState.events. */
  const calendarDateKey = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  /* Populate the year picker with a ±100-year window around today. */
  function populateCalendarYears() {
    const currentYear = new Date().getFullYear();
    calendarYearSelect.replaceChildren();
    for (let year = currentYear - 100; year <= currentYear + 100; year += 1) {
      const option = document.createElement("option");
      option.value = year;
      option.textContent = year;
      calendarYearSelect.append(option);
    }
  }

  /* Render the "selected day" panel and its list of events. */
  function renderCalendarEvents() {
    const key = calendarDateKey(calendarState.selected);

    calendarSelectedLbl.textContent = calendarState.selected.toLocaleDateString([], {
      weekday: "long",
      month:   "long",
      day:     "numeric",
      year:    "numeric",
    });

    calendarEvents.replaceChildren();
    const events = calendarState.events[key] || [];

    if (!events.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "No events scheduled.";
      calendarEvents.append(empty);
      return;
    }

    events.forEach((event, index) => {
      const item = document.createElement("div");
      item.className = "calendar-event";

      const text = document.createElement("span");
      text.textContent = `${event.time ? `${event.time} · ` : ""}${event.title}`;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.title = "Remove event";
      remove.addEventListener("click", () => {
        calendarState.events[key].splice(index, 1);
        if (!calendarState.events[key].length) delete calendarState.events[key];
        renderCalendar();   /* redraw grid so the event dot updates too */
      });

      item.append(text, remove);
      calendarEvents.append(item);
    });
  }

  /* Draw the whole month grid. */
  function renderCalendar() {
    const year  = calendarState.date.getFullYear();
    const month = calendarState.date.getMonth();

    /* Keep the pickers in sync with the internal state. */
    calendarMonthSelect.value = String(month);
    calendarYearSelect.value  = String(year);

    calendarGrid.replaceChildren();

    const firstDay    = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayKey    = calendarDateKey(new Date());

    /* Leading blanks so day 1 lands on the correct weekday column. */
    for (let index = 0; index < firstDay + daysInMonth; index += 1) {
      if (index < firstDay) {
        const blank = document.createElement("span");
        blank.className = "calendar-day blank";
        calendarGrid.append(blank);
        continue;
      }

      const day  = index - firstDay + 1;
      const date = new Date(year, month, day);
      const key  = calendarDateKey(date);

      const button = document.createElement("button");
      button.className = "calendar-day";
      button.type = "button";
      button.dataset.date = key;
      button.setAttribute("role", "gridcell");
      button.textContent = day;

      if (key === todayKey) button.classList.add("today");
      if (key === calendarDateKey(calendarState.selected)) {
        button.classList.add("selected");
      }

      /* Little dot in the corner for days with events. */
      if (calendarState.events[key]?.length) {
        const marker = document.createElement("span");
        marker.className = "calendar-event-dot";
        marker.setAttribute(
          "aria-label",
          `${calendarState.events[key].length} event(s)`,
        );
        button.append(marker);
      }

      button.addEventListener("click", () => {
        calendarState.selected = date;
        renderCalendar();
      });

      calendarGrid.append(button);
    }

    renderCalendarEvents();
  }

  /* Toolbar: month navigation and "Today". */
  document.querySelector("#calendar-previous").addEventListener("click", () => {
    calendarState.date.setMonth(calendarState.date.getMonth() - 1);
    renderCalendar();
  });
  document.querySelector("#calendar-next").addEventListener("click", () => {
    calendarState.date.setMonth(calendarState.date.getMonth() + 1);
    renderCalendar();
  });
  document.querySelector("#calendar-today").addEventListener("click", () => {
    calendarState.date     = new Date();
    calendarState.selected = new Date();
    renderCalendar();
  });

  /* Populate the month dropdown (0-indexed values match getMonth()). */
  calendarMonthSelect.replaceChildren(
    ...Array.from({ length: 12 }, (_, month) => {
      const option = document.createElement("option");
      option.value = month;
      option.textContent = new Date(2000, month, 1).toLocaleDateString([], {
        month: "long",
      });
      return option;
    }),
  );
  populateCalendarYears();

  /* When either picker changes, jump the grid to the chosen month/year. */
  function updateCalendarFromPickers() {
    const year  = Number(calendarYearSelect.value);
    const month = Number(calendarMonthSelect.value);

    /* Clamp the day so e.g. Jan 31 → Feb 28 doesn't roll into March. */
    const day = Math.min(
      calendarState.date.getDate(),
      new Date(year, month + 1, 0).getDate(),
    );

    calendarState.date     = new Date(year, month, day);
    calendarState.selected = new Date(year, month, day);
    renderCalendar();
  }
  calendarMonthSelect.addEventListener("change", updateCalendarFromPickers);
  calendarYearSelect .addEventListener("change", updateCalendarFromPickers);

  /* Add-event form. */
  document.querySelector("#calendar-event-form").addEventListener("submit", (event) => {
    event.preventDefault();

    const titleInput = document.querySelector("#calendar-event-title");
    const timeInput  = document.querySelector("#calendar-event-time");
    const key        = calendarDateKey(calendarState.selected);

    calendarState.events[key] ||= [];
    calendarState.events[key].push({
      title: titleInput.value.trim(),
      time:  timeInput.value,
    });

    titleInput.value = "";
    timeInput.value  = "";
    renderCalendar();
  });

  renderCalendar();   /* initial paint */

  /* -------------------------------------------------------------------------
     CALCULATOR KEYBOARD SHORTCUTS
     Only active when the Calculator window is visible and focus isn't in a
     form control (so typing in a text field doesn't fire calculator digits).
     ---------------------------------------------------------------------- */
  document.addEventListener("keydown", (event) => {
    const calculatorWindow = windows.get("calculator");
    if (
      !calculatorWindow ||
      calculatorWindow.classList.contains("hidden") ||
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement
    ) {
      return;
    }

    if (/^\d$/.test(event.key))              inputCalculatorNumber(event.key);
    if (event.key === ".")                   inputCalculatorDecimal();
    if (event.key === "+")                   chooseCalculatorOperation("add");
    if (event.key === "-")                   chooseCalculatorOperation("subtract");
    if (event.key === "*")                   chooseCalculatorOperation("multiply");
    if (event.key === "/") {
      event.preventDefault();                /* stops Firefox quick-find */
      chooseCalculatorOperation("divide");
    }
    if (event.key === "Enter" || event.key === "=") calculateResult();
    if (event.key === "Escape")              clearCalculator();
    if (event.key === "Backspace") {
      calculator.value = calculator.value.length > 1
        ? calculator.value.slice(0, -1) : "0";
      updateCalculatorDisplay();
    }
  });

  /* -------------------------------------------------------------------------
     FULL-SCREEN TOGGLE
     If a window is open and focused, "full screen" means maximising that
     window.  Otherwise it toggles real browser full-screen.
     ---------------------------------------------------------------------- */
  async function toggleFullscreen() {
    const activeWindow = [...windows.values()].find(
      (element) =>
        !element.classList.contains("hidden") &&
        element.classList.contains("focused"),
    );

    if (activeWindow) {
      activeWindow.classList.toggle("maximized");
      return;
    }

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (!document.documentElement.requestFullscreen) {
        throw new Error("Full-screen mode is not supported by this browser.");
      }
      await document.documentElement.requestFullscreen();
    } catch (error) {
      console.error("Unable to change full-screen mode:", error);
      alert("Full-screen mode was blocked by the browser. Try the button again.");
    }
  }

  document.querySelector("#fullscreen-button").addEventListener("click", toggleFullscreen);

  const fullscreenPrompt = document.querySelector("#fullscreen-prompt");
  fullscreenPrompt.addEventListener("click", toggleFullscreen);

  // Browsers usually require a user gesture before granting full-screen mode.
  // Try on load, then offer a button if the browser blocks the automatic request.
  try {
    if (!document.documentElement.requestFullscreen) {
      throw new Error("Full-screen mode is not supported by this browser.");
    }
    document.documentElement.requestFullscreen().catch(() => {
      fullscreenPrompt.classList.remove("hidden");
    });
  } catch {
    fullscreenPrompt.classList.remove("hidden");
  }

  /* Keep the button's title in sync with the browser's full-screen state. */
  document.addEventListener("fullscreenchange", () => {
    const button = document.querySelector("#fullscreen-button");
    const isFullscreen = Boolean(document.fullscreenElement);
    button.textContent = "⛶";
    button.title = isFullscreen ? "Exit full screen" : "Enter full screen";
    if (isFullscreen) fullscreenPrompt.classList.add("hidden");
  });

  /* -------------------------------------------------------------------------
     START MENU SEARCH
     Live-filters the pinned apps and recommended items as the user types.
     ---------------------------------------------------------------------- */
  document.querySelector("#start-search").addEventListener("input", (event) => {
    const query = event.target.value.toLowerCase();
    document
      .querySelectorAll(".app-grid button, .recommended button")
      .forEach((item) => {
        item.hidden = query && !item.textContent.toLowerCase().includes(query);
      });
  });

  /* -------------------------------------------------------------------------
     WINDOW DRAG & DOUBLE-CLICK-TO-MAXIMISE
     Pointer Events give us mouse/touch/pen in one code path.
     ---------------------------------------------------------------------- */
  document.querySelectorAll(".window-header").forEach((header) => {
    /* Double-click toggles maximised. */
    header.addEventListener("dblclick", () => {
      header.closest(".window").classList.toggle("maximized");
    });

    /* Single-pointer drag — only when not maximised and not on the actions. */
    header.addEventListener("pointerdown", (event) => {
      const element = header.closest(".window");

      if (
        element.classList.contains("maximized") ||
        event.target.closest(".window-actions")
      ) {
        return;
      }

      const startX = event.clientX;
      const startY = event.clientY;
      const startLeft = element.offsetLeft;
      const startTop  = element.offsetTop;

      /* Capture the pointer so we keep getting move events even if the
         cursor briefly leaves the header. */
      header.setPointerCapture(event.pointerId);

      const move = (moveEvent) => {
        const nextLeft = startLeft + moveEvent.clientX - startX;
        const nextTop  = startTop  + moveEvent.clientY - startY;

        /* Clamp so the window can't be dragged off-screen.  The bottom
           margin reserves space for the 51 px taskbar plus a small gap. */
        const maxLeft = window.innerWidth  - element.offsetWidth  - 8;
        const maxTop  = window.innerHeight - element.offsetHeight - 59;

        element.style.left = `${Math.max(8, Math.min(maxLeft, nextLeft))}px`;
        element.style.top  = `${Math.max(8, Math.min(maxTop,  nextTop ))}px`;
      };

      const stop = () => {
        header.removeEventListener("pointermove", move);
        header.removeEventListener("pointerup", stop);
      };

      header.addEventListener("pointermove", move);
      header.addEventListener("pointerup", stop, { once: true });
    });
  });

  /* -------------------------------------------------------------------------
     TASKBAR CLOCK
     ---------------------------------------------------------------------- */
  const clock = document.querySelector("#clock");
  const clockFlyout = document.querySelector("#clock-flyout");
  const clockExactTime = document.querySelector("#clock-exact-time");
  const clockFullDate = document.querySelector("#clock-full-date");
  const taskbarTimeFormatter = new Intl.DateTimeFormat(
    [],
    { hour: "numeric", minute: "2-digit" },
  );
  const clockTimeFormatter = new Intl.DateTimeFormat(
    [],
    { hour: "numeric", minute: "2-digit", second: "2-digit" },
  );
  const clockDateFormatter = new Intl.DateTimeFormat(
    [],
    { weekday: "long", month: "long", day: "numeric", year: "numeric" },
  );

  function updateClock() {
    const now = new Date();
    clock.textContent = taskbarTimeFormatter.format(now);
    clockExactTime.textContent = clockTimeFormatter.format(now);
    clockExactTime.dateTime = now.toISOString();
    clockFullDate.textContent = clockDateFormatter.format(now);
    // Build the date from local calendar fields to avoid shifting at UTC midnight.
    clockFullDate.dateTime = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
    clock.title = clockDateFormatter.format(now);
  }

  clock.addEventListener("click", (event) => {
    event.stopPropagation();
    wifiFlyout.classList.add("hidden");
    wifiButton.setAttribute("aria-expanded", "false");
    soundFlyout.classList.add("hidden");
    soundButton.setAttribute("aria-expanded", "false");
    clockFlyout.classList.toggle("hidden");
    clock.setAttribute(
      "aria-expanded",
      String(!clockFlyout.classList.contains("hidden")),
    );
  });

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element) ||
        !event.target.closest(".clock-control")) {
      clockFlyout.classList.add("hidden");
      clock.setAttribute("aria-expanded", "false");
    }
  });

  // Keep the seconds in the open fly-out current without re-creating formatters.
  updateClock();
  setInterval(updateClock, 1000);
})();