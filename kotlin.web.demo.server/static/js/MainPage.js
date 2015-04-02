/*
 * Copyright 2000-2015 JetBrains s.r.o.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var sessionId = -1;

var configurationManager = new ConfigurationComponent();
var actionManager = new ActionManager();
var differenceDialog = new DifferenceDialogView();

actionManager.registerAction("org.jetbrains.web.demo.run",
    new Shortcut(["Ctrl", "F9"], function (e) {
        return e.keyCode == 120 && e.ctrlKey;
    }), new Shortcut(["Ctrl", "R"], function (e) {
        return e.keyCode == 82 && e.ctrlKey;
    }));
actionManager.registerAction("org.jetbrains.web.demo.reformat",
    new Shortcut(["Ctrl", "Alt", "L"], null), /*default*/
    new Shortcut(["Cmd", "Alt", "L"], null));
/*mac*/
actionManager.registerAction("org.jetbrains.web.demo.autocomplete",
    new Shortcut(["Ctrl", "Space"], null));
actionManager.registerAction("org.jetbrains.web.demo.save",
    new Shortcut(["Ctrl", "S"], function (e) {
        return e.keyCode == 83 && e.ctrlKey;
    }), new Shortcut(["Cmd", "S"], function (e) {
        return e.keyCode == 83 && e.metaKey;
    }));

var incompleteActionManager = new IncompleteActionManager();
incompleteActionManager.registerAction("save", "onHeadersLoaded",
    function () {
        localStorage.setItem("contentToSave", JSON.stringify(accordion.getSelectedProject()));
    },
    function () {
        var content = JSON.parse(localStorage.getItem("contentToSave"));
        localStorage.removeItem("contentToSave");
        if (content != null && loginView.isLoggedIn()) {
            saveProjectDialog.open(projectProvider.forkProject.bind(null, content, function (data) {
                accordion.addNewProjectWithContent(data.publicId, JSON.parse(data.content));
            }), content.name);
        }
    });

var editor = new KotlinEditor();

/**
 * @const
 */
var statusBarView = new StatusBarView(document.getElementById("statusBar"));

var consoleOutputView = new ConsoleOutputView(document.getElementById(console));
var consoleOutputElement = document.createElement("div");
consoleOutputView.writeTo(consoleOutputElement);
consoleOutputView.makeReference = function (fileName, lineNo) {
    var fileView = accordion.getSelectedProjectView().getFileViewByName(fileName);
    if (fileView != null) {
        var a = document.createElement("div");
        a.className = "link";
        if (fileName != null) {
            a.innerHTML = fileName + ':' + lineNo;
        } else {
            a.innerHTML = "Unknown Source";
        }
        a.onclick = function () {
            fileView.fireSelectEvent();
            editor.setCursor(lineNo - 1, 0);
            editor.focus();
        };
        return a;
    } else {
        var span = document.createElement("span");
        if (fileName != null) {
            span.innerHTML = fileName + ':' + lineNo;
        } else {
            span.innerHTML = "Unknown Source";
        }
        return span;
    }
};

var generatedCodeView = new GeneratedCodeView(document.getElementById("generated-code"));
var consoleView = new ConsoleView(document.getElementById("program-output"), $("#result-tabs"));
var junitView = new JUnitView(document.getElementById("program-output"), $("#result-tabs"));
var problemsView = new ProblemsView(document.getElementById("problems"), $("#result-tabs"));

problemsView.setCursor = function (filename, line, ch) {
    accordion.getSelectedProjectView().getFileViewByName(filename).fireSelectEvent();
    editor.setCursor(line, ch);
    editor.focus();
};

var canvas;
canvasDialog = $("#popupForCanvas").dialog({
    width: 640,
    height: 360,
    resizable: false,
    autoOpen: false,
    modal: true,
    open: function () {
        $(canvas).width(canvasDialog.width() - 10);
        $(canvas).height(canvasDialog.height() - 10);
    },
    close: function () {
        canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
        window.clearAllIntervals();
    }
});

canvas = document.getElementById("mycanvas");
canvas.setAttribute("width", canvasDialog.dialog("option", "width") + "");
canvas.setAttribute("height", (canvasDialog.dialog("option", "height") - 30) + "");

var shortcutsHelpDialog = new ShortcutsHelpView();
document.getElementById("shortcuts-button").onclick = shortcutsHelpDialog.open;

var helpModelForWords = new HelpModel("Words");
var helpViewForWords = new HelpView(helpModelForWords);
helpViewForWords.hide();
var projectActionsView = new ProjectActionsView(document.getElementById("editor-notifications"));
projectActionsView.registerStatus("localVersion", "This is your local version of this project", [
    {
        name: "Revert file",
        callback: function () {
            if (accordion.getSelectedFile() != null) {
                accordion.getSelectedFile().loadOriginal();
            }
        }
    },
    {
        name: "Revert project",
        callback: function () {
            accordion.getSelectedProject().loadOriginal();
        }
    }
]);
projectActionsView.registerStatus("localFile", "This is your local version of this project", [
    {
        name: "Revert project",
        callback: function () {
            accordion.getSelectedProject().loadOriginal();
        }
    }
]);


var runProvider = (function () {
    var runProvider = new RunProvider();
    runProvider.onSuccess = function (output, project) {
        if (project.getConfiguration() == Configuration.getStringFromType(Configuration.type.CANVAS)) {
            canvasDialog.dialog("open");
        }
        $(output).each(function (ind, data) {
            if (data.type == "errors") {
                project.setErrors(data.errors);
                problemsView.addMessages();
                editor.updateHighlighting();
            } else if (data.type == "toggle-info" || data.type == "info" || data.type == "generatedJSCode") {
                generatedCodeView.setOutput(data);
            } else {
                if (configurationManager.getConfiguration().type == Configuration.type.JUNIT) {
                    junitView.setOutput(data);
                } else {
                    consoleView.setOutput(data);
                }
            }
        });
        statusBarView.setStatus(ActionStatusMessages.run_java_ok);
    };

    runProvider.onComplete = function () {
        $(runButton).button("option", "disabled", false);
    };

    runProvider.onErrorsFound = function (data, project) {
        $(data).each(function (ind, data) {
            if (data.type == "errors") {
                project.setErrors(data.errors);
                $("#result-tabs").tabs("option", "active", 0);
                problemsView.addMessages();
                editor.updateHighlighting();
                statusBarView.setStatus(ActionStatusMessages.get_highlighting_ok, [getNumberOfErrorsAndWarnings(data.errors)]);
            }
        });
    };

    runProvider.onFail = function (error) {
        consoleView.writeException(error);
        statusBarView.setStatus(ActionStatusMessages.run_java_fail);
    };

    return runProvider;
})();

var loginProvider = new LoginProvider();
var loginView = new LoginView(loginProvider);

function getNumberOfErrorsAndWarnings(data) {
    var noOfErrorsAndWarnings = 0;
    for (var filename in data) {
        noOfErrorsAndWarnings += data[filename].length
    }
    return noOfErrorsAndWarnings
}

var highlightingProvider = (function () {
    function onSuccess(data) {
        accordion.getSelectedProject().setErrors(data);
        problemsView.addMessages(data);
        statusBarView.setStatus(ActionStatusMessages.get_highlighting_ok, [getNumberOfErrorsAndWarnings(data)]);
    }

    function onFail(error) {
        unBlockContent();
        consoleView.writeException(error);
        statusBarView.setStatus(ActionStatusMessages.get_highlighting_fail);
    }

    return new HighlightingProvider(onSuccess, onFail)
})();

var completionProvider = (function () {
    var completionProvider = new CompletionProvider();
    completionProvider.onSuccess = function () {
        statusBarView.setStatus(ActionStatusMessages.get_completion_ok);
    };

    completionProvider.onFail = function (error) {
        consoleView.writeException(error);
        statusBarView.setStatus(ActionStatusMessages.get_completion_fail);
    };

    return completionProvider;
})();


configurationManager.onChange = function (configuration) {
    accordion.getSelectedProject().setConfiguration(Configuration.getStringFromType(configuration.type));
};

configurationManager.onFail = function (exception) {
    consoleView.writeException(exception);
    statusBarView.setMessage(ActionStatusMessages.change_configuration_fail);
};

var converterView = new ConverterView();
document.getElementById("java2kotlin-button").onclick = converterView.open;

var navBarView = new Kotlin.modules["kotlin.web.demo.frontend"].NavBarView(document.getElementById("grid-nav"));

var accordion = (function () {
    var accordion = new AccordionView(document.getElementById("examples-list"));

    accordion.onProjectSelected = function (project) {
        if (project.isEmpty()) {
            editor.closeFile();
            if (accordion.getSelectedProject().getPublicId() != getProjectIdFromUrl()) {
                setState(userProjectPrefix + project.getPublicId(), project.getName());
            }
            navBarView.onProjectSelected(project);
        }
        consoleView.clear();
        junitView.clear();
        generatedCodeView.clear();
        problemsView.addMessages();
        $("#result-tabs").tabs("option", "active", 0);
        argumentsInputElement.value = project.getArgs();
        configurationManager.updateConfiguration(project.getConfiguration());
    };

    accordion.onSelectFile = function (previousFile, currentFile) {
        if (previousFile != null) {
            if (previousFile.getProject().getType() != ProjectType.USER_PROJECT) {
                previousFile.getProject().save();
            } else {
                previousFile.save();
            }
        }

        var url;
        if (currentFile.getProjectType() == ProjectType.EXAMPLE) {
            url = currentFile.getPublicId();
        } else if (currentFile.isModifiable()) {
            url = userProjectPrefix + accordion.getSelectedProject().getPublicId() + "/" + currentFile.getPublicId();
        } else {
            url = userProjectPrefix + accordion.getSelectedProject().getPublicId() + "/" + currentFile.getName();
        }
        ;
        setState(url, currentFile.getProject().getName());
        navBarView.onFileSelected(currentFile);

        editor.closeFile();
        editor.open(currentFile);
        currentFile.compareContent();
    };

    accordion.onFail = function (exception, actionCode) {
        consoleView.writeException(exception);
        statusBarView.setMessage(actionCode);
    };

    accordion.onProjectDeleted = function () {
        clearState();
        statusBarView.setStatus(ActionStatusMessages.delete_program_ok);
    };

    accordion.onSaveProgram = function () {
        statusBarView.setStatus(ActionStatusMessages.save_program_ok);
    };

    accordion.onModifiedSelectedFile = function (file) {
        if (file.getProjectType() == ProjectType.EXAMPLE) {
            projectActionsView.setStatus("localVersion");
        } else if (file.getProjectType() == ProjectType.PUBLIC_LINK) {
            if (file.getProject().isRevertible()) {
                var onProjectExist = function () {
                    if (file.isRevertible()) {
                        fileProvider.checkFileExistence(
                            file.getPublicId(),
                            projectActionsView.setStatus.bind(null, "localVersion"),
                            function () {
                                projectActionsView.setStatus.bind(null, "localFile");
                                file.makeNotRevertible();
                            }
                        )
                    } else {
                        projectActionsView.setStatus("localFile");
                    }
                };
                var onProjectNotExist = function () {
                    projectActionsView.setStatus("default");
                    file.getProject().makeNotRevertible();
                };
                projectProvider.checkIfProjectExists(
                    file.getProject().getPublicId(),
                    onProjectExist,
                    onProjectNotExist
                );
            } else {
                projectActionsView.setStatus("default");
            }
        }
    };

    accordion.onUnmodifiedSelectedFile = function () {
        projectActionsView.setStatus("default");
    };

    accordion.onSelectedFileDeleted = function () {
        var project = accordion.getSelectedProject();
        navBarView.onSelectedFileDeleted();
        setState(userProjectPrefix + project.getPublicId(), project.getName());
        editor.closeFile();
    };

    return accordion
})();

window.onpopstate = function () {
    var projectId = getProjectIdFromUrl();
    if (accordion.getSelectedProject().getPublicId() != projectId) {
        accordion.selectProject(projectId);
    }
    accordion.getSelectedProjectView().selectFileFromUrl();
};

var timer;
editor.onCursorActivity = function (cursorPosition) {
    helpViewForWords.hide();
    var messageForLineAtCursor = editor.getMessageForLineAtCursor(cursorPosition);
    //Save previous message if current is empty
    if (messageForLineAtCursor != "") {
        statusBarView.setMessage(messageForLineAtCursor);
    }

    var pos = editor.cursorCoords();
    helpViewForWords.setPosition(pos);

    if (timer) {
        clearTimeout(timer);
        timer = setTimeout(function () {
            helpViewForWords.update(editor.getWordAtCursor(cursorPosition))
        }, 1000);
    } else {
        timer = setTimeout(function () {
            helpViewForWords.update(editor.getWordAtCursor(cursorPosition))
        }, 1000);
    }
};


var runButton = document.getElementById("runButton");
$(runButton)
    .button()
    .click(function () {
        $(runButton).button("option", "disabled", true);
        consoleView.clear();
        junitView.clear();
        generatedCodeView.clear();
        runProvider.run(configurationManager.getConfiguration(), accordion.getSelectedProject());
    });


loginProvider.onLogin = function (data) {
    if (data.isLoggedIn) {
        loginView.setUserName(data.userName, data.type);
        statusBarView.setStatus(ActionStatusMessages.login_ok);
    }
    accordion.loadAllContent();
};

loginProvider.beforeLogout = function () {
    if (accordion.getSelectedFile() != null) {
        accordion.getSelectedFile().save();
    }
    accordion.getSelectedProject().save();
};

loginProvider.onLogout = function () {
    loginView.logout();
    statusBarView.setStatus(ActionStatusMessages.logout_ok);
    accordion.loadAllContent();
};

loginProvider.onFail = function (exception, actionCode) {
    consoleView.writeException(exception);
    statusBarView.setMessage(actionCode);
};

var fileProvider = (function () {
    var fileProvider = new FileProvider();

    fileProvider.onFileRenamed = function () {
    };

    fileProvider.onRenameFileFailed = function () {
    };

    fileProvider.onOriginalFileLoaded = function (data) {
        if (accordion.getSelectedProject().getType() == ProjectType.PUBLIC_LINK) {
            accordion.getSelectedProjectView().updateFileViewSafely(accordion.getSelectedFileView(), unEscapeString(data.name));
        }
        editor.reloadFile();
    };

    return fileProvider;
})();

var projectProvider = (function () {
    var projectProvider = new ProjectProvider();

    projectProvider.onProjectLoaded = function (projectContent) {
        statusBarView.setStatus(ActionStatusMessages.load_project_ok)
    };

    projectProvider.onFail = function () {
        statusBarView.setStatus(ActionStatusMessages.load_project_fail)
    };

    projectProvider.onNewProjectAdded = function (name, projectId, fileId) {
        accordion.addNewProject(name, projectId, fileId, null);
    };

    return projectProvider;
})();

var headersProvider = (function () {
    var headersProvider = new HeadersProvider();

    headersProvider.onHeadersLoaded = function () {
        statusBarView.setStatus(ActionStatusMessages.load_headers_ok);
    };

    headersProvider.onProjectHeaderLoaded = function () {
        statusBarView.setStatus(ActionStatusMessages.load_header_ok);
    };

    headersProvider.onProjectHeaderNotFound = function () {
        statusBarView.setStatus(ActionStatusMessages.load_header_fail);
        window.alert("Can't find project, maybe it was removed by the user.");
        clearState();
        accordion.loadFirstItem();
    };

    headersProvider.onFail = function (message) {
        statusBarView.setStatus(ActionStatusMessages.load_header_fail);
        console.log(message);
    };

    return headersProvider;
})();

$(document).keydown(function (e) {
    var shortcut = actionManager.getShortcutByName("org.jetbrains.web.demo.run");
    if (shortcut.isPressed(e)) {
        runButton.click();
    } else {
        shortcut = actionManager.getShortcutByName("org.jetbrains.web.demo.save");
        if (shortcut.isPressed(e)) {
            saveButton.click();
        }
    }

});

var isShortcutsShow = true;
$(".toggleShortcuts").click(function () {
    $("#help3").toggle();
    if (isShortcutsShow) {
        isShortcutsShow = false;
        document.getElementById("toggleShortcutsButton").src = "/static/images/toogleShortcutsOpen.png";
    } else {
        isShortcutsShow = true;
        document.getElementById("toggleShortcutsButton").src = "/static/images/toogleShortcuts.png";

    }
});

$("#help3").toggle(true);

function generateAjaxUrl(type, parameters) {
    var url = [location.protocol, '//', location.host, "/"].join('');
    url = url + "kotlinServer?sessionId=" + sessionId + "&type=" + type;
    for (var parameterName in parameters) {
        url += "&" + parameterName + "=" + parameters[parameterName];
    }
    return url;
}

function setSessionId() {
    $.ajax({
        url: generateAjaxUrl("getSessionId"),
        context: document.body,
        type: "GET",
        dataType: "json",
        timeout: 10000,
        success: getSessionIdSuccess
    });
}

function getSessionIdSuccess(data) {
    data = eval(data);
    if (data[0] != null && data[0] != '') {
        sessionId = data[0];
    }
}


var saveButton = $("#saveButton").click(function () {
    if (accordion.getSelectedProject().getType() == ProjectType.USER_PROJECT) {
        accordion.getSelectedProject().save();
        if (accordion.getSelectedFile() != null) {
            accordion.getSelectedFile().save();
        }
    } else {
        $("#saveAsButton").click()
    }
});


var saveProjectDialog = new InputDialogView("Save project", "Project name:", "Save");
saveProjectDialog.validate = accordion.validateNewProjectName;

$("#saveAsButton").click(function () {
    if (loginView.isLoggedIn()) {
        saveProjectDialog.open(projectProvider.forkProject.bind(null, accordion.getSelectedProject(), function (data) {
            accordion.getSelectedProject().loadOriginal();
            accordion.addNewProjectWithContent(data.publicId, JSON.parse(data.content));
        }), accordion.getSelectedProject().getName());
    } else {
        incompleteActionManager.incomplete("save");
        loginDialog.dialog("open");
    }
});

runButton.title = runButton.title.replace("@shortcut@", actionManager.getShortcutByName("org.jetbrains.web.demo.run").getName());
saveButton.attr("title", saveButton.attr("title").replace("@shortcut@", actionManager.getShortcutByName("org.jetbrains.web.demo.save").getName()));

function loadShortcuts() {
    shortcutsHelpDialog.addShortcut(actionManager.getShortcutByName("org.jetbrains.web.demo.autocomplete").getKeyNames(), "Code completion");
    shortcutsHelpDialog.addShortcut(actionManager.getShortcutByName("org.jetbrains.web.demo.run").getKeyNames(), "Run program");
    shortcutsHelpDialog.addShortcut(actionManager.getShortcutByName("org.jetbrains.web.demo.reformat").getKeyNames(), "Reformat selected fragment");
    shortcutsHelpDialog.addShortcut(actionManager.getShortcutByName("org.jetbrains.web.demo.save").getKeyNames(), "Save current project");
}

window.onbeforeunload = function () {
    accordion.onBeforeUnload();
    incompleteActionManager.onBeforeUnload();
    localStorage.setItem("openedItemId", accordion.getSelectedProject().getPublicId());

    if (accordion.getSelectedFile() != null) {
        accordion.getSelectedFile().save();
    }
    accordion.getSelectedProject().save();

    localStorage.setItem("highlightOnTheFly", document.getElementById("on-the-fly-checkbox").checked);
    //return null;
};


var loginDialog = $("#login-dialog").dialog({
    modal: "true",
    resizable: false,
    width: 300,
    autoOpen: false
});

$("#runMode").selectmenu({
    icons: {button: "selectmenu-arrow-icon"}
});

var argumentsInputElement = document.getElementById("arguments");
argumentsInputElement.oninput = function () {
    accordion.getSelectedProject().setArguments(argumentsInputElement.value);
};

$("#on-the-fly-checkbox")
    .prop("checked", localStorage.getItem("highlightOnTheFly") == "true")
    .on("change", function () {
        var checkbox = document.getElementById("on-the-fly-checkbox");
        editor.highlightOnTheFly(checkbox.checked);
    });
editor.highlightOnTheFly(document.getElementById("on-the-fly-checkbox").checked);

function setKotlinJsOutput() {
    Kotlin.out = new Kotlin.BufferedOutput();
}

function setKotlinVersion() {
    $.ajax("http://kotlinlang.org/latest_release_version.txt", {
        type: "GET",
        timeout: 1000,
        success: function (kotlinVersion) {
            document.getElementById("kotlinlang-kotlin-version").innerHTML = "(" + kotlinVersion + ")";
        }
    });
    document.getElementById("webdemo-kotlin-version").innerHTML = KOTLIN_VERSION;
}

function getKey() {
    $.ajax({
        url: generateAjaxUrl("google_key"),
        type: "GET",
        timeout: 1000,
        success: function (data) {
            console.log(data);
        }
    });
}

var blockTimer;
function blockContent() {
    clearTimeout(blockTimer);
    var overlay = document.getElementById("global-overlay");
    overlay.style.display = "block";
    overlay.style.visibility = "hidden";
    overlay.focus();
    blockTimer = setTimeout(function () {
        overlay.style.visibility = "initial";
    }, 250);
}

function unBlockContent() {
    clearTimeout(blockTimer);
    document.getElementById("global-overlay").style.display = "none";
}

setSessionId();
loadShortcuts();
setKotlinJsOutput();
setKotlinVersion();

