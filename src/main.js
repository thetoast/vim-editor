document.addEventListener("DOMContentLoaded", function(event) {

  const modeByModeMode = CodeMirror.modeInfo.reduce(function (acc, m) {
    if (acc[m.mode]) {
      acc[m.mode].push(m)
    } else {
      acc[m.mode] = [m]
    }
    return acc;
  }, {});

  const modeModeAndMimeByName = CodeMirror.modeInfo.reduce(function (acc, m) {
    acc[m.name] = {mode: m.mode, mime: m.mime};
    return acc;
  }, {});

  const modes = Object.keys(modeModeAndMimeByName);

  var componentManager;
  var workingNote, clientData;
  var lastValue, lastUUID;
  var editor, vimrcEditor, select;
  var vimrcWrapper, vimrcArea, saveVimrc, editVimrc, cancelVimrc;
  var defaultMode = "JavaScript";
  var ignoreTextChange = false;
  var initialLoad = true;

  function loadComponentManager() {
    var permissions = [{name: "stream-context-item"}, {name: "stream-items"}]
    componentManager = new ComponentManager(permissions, function(){
      // on ready
      var platform = componentManager.platform;
      if(platform) {
        document.body.classList.add(platform);
      }
    });

    componentManager.streamContextItem((note) => {
      onReceivedNote(note);
    });
  }

  function save() {
    if(workingNote) {
      // Be sure to capture this object as a variable, as this.note may be reassigned in `streamContextItem`, so by the time
      // you modify it in the presave block, it may not be the same object anymore, so the presave values will not be applied to
      // the right object, and it will save incorrectly.
      let note = workingNote;

      componentManager.saveItemWithPresave(note, () => {
        lastValue = editor.getValue();
        note.content.text = lastValue;
        note.clientData = clientData;

        note.content.preview_plain = null;
        note.content.preview_html = null;
      });
    }
  }

  function onReceivedNote(note) {
    if(note.uuid !== lastUUID) {
      // Note changed, reset last values
      lastValue = null;
      initialLoad = true;
      lastUUID = note.uuid;

      loadAndParseVimrc();
    }

    workingNote = note;
    // Only update UI on non-metadata updates.
    if(note.isMetadataUpdate) {
      return;
    }

    clientData = note.clientData;
    var mode = clientData.mode;
    if(mode) {
      changeMode(mode);
    } else {
      // assign editor's default from component settings
      let defaultLanguage = componentManager.componentDataValueForKey("language");
      changeMode(defaultLanguage);
    }

    if(editor) {
      if(note.content.text !== lastValue) {
        ignoreTextChange = true;
        editor.getDoc().setValue(workingNote.content.text);
        ignoreTextChange = false;
      }

      if(initialLoad) {
        initialLoad = false;
        editor.getDoc().clearHistory();
      }
    }
  }

  function loadAndParseVimrc() {
    var vimrc = componentManager.componentDataValueForKey("vimrc");

    if (vimrc) {
      vimrcArea.value = vimrc;

      // grab each line of note and push into vim API
      vimrc.split("\n").forEach(line => {
        CodeMirror.Vim.handleEx(editor, line);
      });
    }

    if (!vimrcEditor) {
      createVimrcEditor();
    }
  }

  function createVimrcEditor() {
    vimrcEditor = CodeMirror.fromTextArea(vimrcArea, {
      lineNumbers: true,
      styleSelectedText: true,
      lineWrapping: true
    });
    vimrcEditor.setSize("100%", "100%");
    vimrcEditor.setOption("keyMap", "vim");
    vimrcWrapper.classList.add("hidden");
  }

  window.editVimrc = function () {
    vimrcWrapper.classList.remove("hidden");
    saveVimrc.classList.remove("hidden");
    cancelVimrc.classList.remove("hidden");
    editVimrc.classList.add("hidden");
  }

  window.saveVimrc = function () {
    vimrcWrapper.classList.add("hidden");
    saveVimrc.classList.add("hidden");
    cancelVimrc.classList.add("hidden");
    editVimrc.classList.remove("hidden");
    componentManager.setComponentDataValueForKey("vimrc", vimrcEditor.getValue());
    loadAndParseVimrc();
  }

  window.cancelVimrc = function () {
    var vimrc = componentManager.componentDataValueForKey("vimrc");
    vimrcEditor.getDoc().setValue(vimrc);
    vimrcWrapper.classList.add("hidden");
    saveVimrc.classList.add("hidden");
    cancelVimrc.classList.add("hidden");
    editVimrc.classList.remove("hidden");
    vimrcEditor.getDoc().setValue(vimrc);
  }

  function initVimrcControls() {
    vimrcWrapper = document.getElementById("vimrc-wrapper");
    vimrcArea = document.getElementById("vimrc");
    saveVimrc = document.getElementById("save-vimrc");
    editVimrc = document.getElementById("edit-vimrc");
    cancelVimrc = document.getElementById("cancel-vimrc");
  }

  function loadEditor() {
    editor = CodeMirror.fromTextArea(document.getElementById("code"), {
      lineNumbers: true,
      styleSelectedText: true,
      lineWrapping: true
    });
    editor.setSize("100%", "100%");

    setTimeout(function () {
      changeMode(defaultMode);
    }, 1);

    createSelectElements();
    initVimrcControls();

    editor.on("change", function(){
      if(ignoreTextChange) {return;}
      save();
    });
  }

  function createSelectElements() {
    select = document.getElementById("select");
    var index = 0;
    for(var element in modes) {
      var opt = document.createElement("option");
      opt.value = index;
      opt.innerHTML = modes[index];
      select.appendChild(opt);
      index++;
    }
  }

  loadEditor();
  loadComponentManager();


  /*
    Editor Modes
  */

  window.setKeyMap = function(keymap) {
    editor.setOption("keyMap", keymap);
  }

  window.onLanguageSelect = function(event) {
    var language = modes[select.selectedIndex];
    changeMode(language);
    save();
  }

  window.setDefaultLanguage = function(event) {
    let language = modes[select.selectedIndex];

    // assign default language for this editor when entering notes
    componentManager.setComponentDataValueForKey("language", language);

    // show a confirmation message
    let message = document.getElementById("default-label");
    let original = message.innerHTML;
    message.innerHTML = "Success";
    message.classList.add("success");

    setTimeout(function () {
      message.classList.remove("success");
      message.innerHTML = original;
    }, 750);
  }

  function inputModeToMode(inputMode) {
    const convertCodeMirrorMode = function (codeMirrorMode) {
      if (codeMirrorMode) {
        return {
          name: codeMirrorMode.name,
          mode: codeMirrorMode.mode,
          mime: codeMirrorMode.mime
        };
      } else {
        return null;
      }
    };

    const extension = /.+\.([^.]+)$/.exec(inputMode);
    const mime = /\//.test(inputMode)

    if (extension) {
      return convertCodeMirrorMode(CodeMirror.findModeByExtension(extension[1]));
    } else if (mime) {
      return convertCodeMirrorMode(CodeMirror.findModeByMIME(mime[1]));
    } else if (modeModeAndMimeByName[inputMode]) {
      return {
        name: inputMode,
        mode: modeModeAndMimeByName[inputMode].mode,
        mime: modeModeAndMimeByName[inputMode].mime
      };
    } else if (modeByModeMode[inputMode]) {
      const firstMode = modeByModeMode[inputMode][0];
      return {
        name: firstMode.name,
        mode: firstMode.mode,
        mime: firstMode.mime
      };
    } else {
      return {
        name: inputMode,
        mode: inputMode,
        mime: inputMode
      };
    }
  }

  function changeMode(inputMode) {
    if(!inputMode) { return; }

    const mode = inputModeToMode(inputMode);

    if(mode) {
      editor.setOption("mode", mode.mime);
      CodeMirror.autoLoadMode(editor, mode.mode);
      if(clientData) {
        clientData.mode = mode.name;
      }
      document.getElementById("select").selectedIndex = modes.indexOf(mode.name);
    } else {
      console.error("Could not find a mode corresponding to " + inputMode);
    }
  }
});
