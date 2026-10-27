/**
 * ==========================================================================
 *  IEDC ATTENDANCE SYSTEM - GOOGLE APPS SCRIPT WEBHOOK
 * ==========================================================================
 *  Dedicated Google Apps Script for recording attendance submissions into
 *  a separate, isolated Google Sheet.
 * 
 *  FEATURES:
 *  - Auto-creates a dedicated Sheet tab for each Attendance Session / Event.
 *  - Standard Attendance Columns:
 *    [Timestamp, Attendance ID, Full Name, Semester, Department, Roll No, Hours, + Any Custom Fields]
 *  - Locks and formats the header row with clean, professional styling.
 *  - Auto-resizes columns for instant readability.
 *  - Real-time response logging with zero data collision with event registration sheets.
 * 
 *  1-MINUTE SETUP GUIDE:
 *  1. Open a new Google Sheet (e.g., name it "IEDC Attendance 2026").
 *  2. In the top menu, click: Extensions -> Apps Script.
 *  3. Delete any default code, paste this entire file, and click Save (Ctrl+S).
 *  4. Click "Deploy" -> "New deployment".
 *  5. Select type: "Web app".
 *  6. Set:
 *     - Execute as: "Me"
 *     - Who has access: "Anyone"
 *  7. Click "Deploy", authorize permissions, and copy the Web App URL.
 *  8. Paste the Web App URL into the Attendance Form's "Google Sheets Webhook URL"
 *     field in your IEDC Admin Dashboard.
 * ==========================================================================
 */

var SPREADSHEET_ID_OR_URL = "";

function getSpreadsheet() {
  if (SPREADSHEET_ID_OR_URL && SPREADSHEET_ID_OR_URL.trim()) {
    var val = SPREADSHEET_ID_OR_URL.trim();
    if (val.indexOf("http") === 0) {
      return SpreadsheetApp.openByUrl(val);
    } else {
      return SpreadsheetApp.openById(val);
    }
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || "";
  var id = (e && e.parameter && (e.parameter.id || e.parameter.form)) || "";

  // 1. Direct form lookup for short URLs (?form=...)
  if (action === "get_form" && id) {
    try {
      var ss = getSpreadsheet();
      var configSheet = ss.getSheetByName("_Attendance_Forms_Config");
      if (configSheet && configSheet.getLastRow() > 1) {
        var rows = configSheet.getDataRange().getValues();
        var targetId = String(id).toLowerCase().trim();
        for (var i = 1; i < rows.length; i++) {
          var rowId = String(rows[i][1]).toLowerCase().trim();
          if (rowId === targetId) {
            var jsonStr = String(rows[i][3] || rows[i][2] || "");
            if (jsonStr && jsonStr.indexOf('{') !== -1) {
              return ContentService.createTextOutput(jsonStr)
                .setMimeType(ContentService.MimeType.JSON);
            }
          }
        }
      }
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({ error: "Attendance form not found" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 2. Fetch all attendance forms
  if (action === "get_all_forms") {
    try {
      var ss = getSpreadsheet();
      var configSheet = ss.getSheetByName("_Attendance_Forms_Config");
      var formsList = [];
      if (configSheet && configSheet.getLastRow() > 1) {
        var rows = configSheet.getDataRange().getValues();
        for (var i = 1; i < rows.length; i++) {
          var jsonStr = String(rows[i][3] || rows[i][2] || "");
          if (jsonStr && jsonStr.indexOf('{') !== -1) {
            try {
              var parsed = JSON.parse(jsonStr);
              if (parsed && (parsed.id || parsed.title)) {
                formsList.push(parsed);
              }
            } catch (pErr) {}
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        count: formsList.length,
        forms: formsList
      })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        error: err.toString(),
        forms: []
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // 3. Health check ping
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    service: "IEDC Attendance Tracking Webhook",
    message: "Attendance API is ready to record student check-ins!",
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    var ss = getSpreadsheet();
    var payload;

    if (e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (jsonErr) {
        payload = e.parameter || {};
      }
    } else {
      payload = e.parameter || {};
    }

    // -------------------------------------------------------------------------
    // ACTION 1: Form Configuration Sync & Tab Pre-Creation
    // -------------------------------------------------------------------------
    if (payload.action === "save_form_config" || (payload.form && !payload["Attendance ID"] && !payload["Booking ID"])) {
      var formObj = payload.form;
      if (typeof formObj === "string") {
        try {
          formObj = JSON.parse(formObj);
        } catch (fErr) {}
      }
      formObj = formObj || {};

      var formId = formObj.id || payload.formId || "attendance-" + Date.now();
      var sessionTitle = formObj.title || payload.title || "Attendance Session";

      // Save to _Attendance_Forms_Config
      var configSheet = ss.getSheetByName("_Attendance_Forms_Config");
      if (!configSheet) {
        configSheet = ss.insertSheet("_Attendance_Forms_Config");
        configSheet.appendRow(["Updated", "Form ID", "Session Title", "Form JSON"]);
        configSheet.getRange(1, 1, 1, 4)
          .setFontWeight("bold")
          .setBackground("#0f172a")
          .setFontColor("#FFFFFF");
        configSheet.setFrozenRows(1);
      }

      var lastRow = configSheet.getLastRow();
      var foundRow = -1;
      if (lastRow > 1) {
        var idValues = configSheet.getRange(2, 2, lastRow - 1, 1).getValues();
        for (var r = 0; r < idValues.length; r++) {
          if (String(idValues[r][0]) === String(formId)) {
            foundRow = r + 2;
            break;
          }
        }
      }

      var nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT+5:30", "yyyy-MM-dd HH:mm:ss");
      var jsonPayload = JSON.stringify(formObj);
      if (foundRow > 0) {
        configSheet.getRange(foundRow, 1, 1, 4).setValues([[nowStr, formId, sessionTitle, jsonPayload]]);
      } else {
        configSheet.appendRow([nowStr, formId, sessionTitle, jsonPayload]);
      }

      // Pre-create dedicated tab for this session
      var cleanTab = sessionTitle.split(':')[0].replace(/[:\\/?*\[\]]/g, '').trim().substring(0, 30) || "Attendance";
      var attSheet = ss.getSheetByName(cleanTab);
      if (!attSheet) {
        var active = ss.getActiveSheet();
        if (active && active.getLastRow() === 0 && (active.getName() === "Sheet1" || active.getName() === "Sheet 1")) {
          attSheet = active;
          attSheet.setName(cleanTab);
        } else {
          attSheet = ss.insertSheet(cleanTab);
        }
      }

      if (attSheet.getLastRow() === 0) {
        var headers = ["Timestamp", "Attendance ID"];
        if (Array.isArray(formObj.questions)) {
          for (var q = 0; q < formObj.questions.length; q++) {
            var qTitle = formObj.questions[q] && formObj.questions[q].title;
            if (qTitle && headers.indexOf(qTitle) === -1) {
              headers.push(qTitle);
            }
          }
        }
        attSheet.appendRow(headers);
        formatHeaderRow(attSheet, headers.length);
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        action: "save_form_config",
        tabName: cleanTab
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // -------------------------------------------------------------------------
    // ACTION 2: Record Student Attendance Submission
    // -------------------------------------------------------------------------
    var eventTitle = payload["_eventTitle"] || payload["Event Title"] || payload["title"] || "Attendance";
    var cleanTabName = eventTitle.split(':')[0].replace(/[:\\/?*\[\]]/g, '').trim().substring(0, 30) || "Attendance";

    var targetSheet = ss.getSheetByName(cleanTabName);
    if (!targetSheet) {
      targetSheet = ss.insertSheet(cleanTabName);
    }

    // 1. Read or initialize existing headers
    var existingHeaders = [];
    if (targetSheet.getLastRow() > 0) {
      existingHeaders = targetSheet.getRange(1, 1, 1, targetSheet.getLastColumn()).getValues()[0];
    } else {
      existingHeaders = ["Timestamp", "Attendance ID"];
      targetSheet.appendRow(existingHeaders);
      formatHeaderRow(targetSheet, existingHeaders.length);
    }

    // 2. Identify fields from payload (excluding internal routing properties)
    var payloadKeys = [];
    for (var k in payload) {
      if (payload.hasOwnProperty(k) && k.indexOf("_") !== 0 && k !== "Event Title" && k !== "Form ID") {
        payloadKeys.push(k);
      }
    }

    // Standard primary order for attendance sheets
    var primaryOrder = [
      "Timestamp",
      "Attendance ID",
      "Booking ID",
      "Full Name",
      "Name",
      "Semester",
      "Department",
      "Branch",
      "Roll No",
      "Roll Number",
      "Student ID",
      "Hours",
      "Session Hours",
      "Duration"
    ];

    payloadKeys.sort(function(a, b) {
      var idxA = primaryOrder.indexOf(a);
      var idxB = primaryOrder.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return 0;
    });

    // 3. Dynamically append any new columns not yet in the sheet
    for (var i = 0; i < payloadKeys.length; i++) {
      var key = payloadKeys[i];
      if (existingHeaders.indexOf(key) === -1) {
        var newColIdx = targetSheet.getLastColumn() + 1;
        targetSheet.getRange(1, newColIdx).setValue(key);
        existingHeaders.push(key);
        formatHeaderCell(targetSheet, newColIdx);
      }
    }

    // 4. Construct the row corresponding to headers
    var rowValues = [];
    for (var h = 0; h < existingHeaders.length; h++) {
      var headerName = existingHeaders[h];
      var cellVal = "";

      if (payload[headerName] !== undefined && payload[headerName] !== null) {
        cellVal = payload[headerName];
      } else if (headerName === "Attendance ID" && payload["Booking ID"]) {
        cellVal = payload["Booking ID"];
      } else if (headerName === "Booking ID" && payload["Attendance ID"]) {
        cellVal = payload["Attendance ID"];
      }

      if (Array.isArray(cellVal)) {
        cellVal = cellVal.join(", ");
      }
      rowValues.push(String(cellVal));
    }

    // 5. Append row
    targetSheet.appendRow(rowValues);

    // Apply clean styling to the newly appended row
    var newRowIdx = targetSheet.getLastRow();
    var rowRange = targetSheet.getRange(newRowIdx, 1, 1, rowValues.length);
    rowRange.setVerticalAlignment("middle");
    rowRange.setFontFamily("Segoe UI, Inter, Roboto, sans-serif");
    rowRange.setFontSize(10);

    // Zebra striping for easy reading
    if (newRowIdx % 2 === 0) {
      rowRange.setBackground("#f8fafc");
    } else {
      rowRange.setBackground("#ffffff");
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Attendance recorded successfully",
      tab: cleanTabName,
      row: newRowIdx
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    try {
      lock.releaseLock();
    } catch (lErr) {}
  }
}

function formatHeaderRow(sheet, numCols) {
  var headerRange = sheet.getRange(1, 1, 1, Math.max(numCols, 1));
  headerRange.setFontWeight("bold");
  headerRange.setFontFamily("Segoe UI, Inter, Roboto, sans-serif");
  headerRange.setFontSize(10);
  headerRange.setBackground("#0f172a"); // Dark slate
  headerRange.setFontColor("#ffffff");
  headerRange.setHorizontalAlignment("left");
  headerRange.setVerticalAlignment("middle");
  sheet.setRowHeight(1, 36);
  sheet.setFrozenRows(1);
}

function formatHeaderCell(sheet, colIdx) {
  var cell = sheet.getRange(1, colIdx);
  cell.setFontWeight("bold");
  cell.setFontFamily("Segoe UI, Inter, Roboto, sans-serif");
  cell.setFontSize(10);
  cell.setBackground("#0f172a");
  cell.setFontColor("#ffffff");
  cell.setHorizontalAlignment("left");
  cell.setVerticalAlignment("middle");
  sheet.setRowHeight(1, 36);
}
