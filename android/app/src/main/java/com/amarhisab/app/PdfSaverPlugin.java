package com.amarhisab.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.InputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "PdfSaver")
public class PdfSaverPlugin extends Plugin {

  @PluginMethod
  public void savePdf(PluginCall call) {
    String fileName = call.getString("fileName");
    String fileUri = call.getString("fileUri");
    if (fileName == null || fileName.isEmpty() || fileUri == null || fileUri.isEmpty()) {
      call.reject("A PDF file and filename are required.");
      return;
    }

    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    intent.setType("application/pdf");
    intent.putExtra(Intent.EXTRA_TITLE, fileName);
    call.getData().put("fileUri", fileUri);
    startActivityForResult(call, intent, "savePdfResult");
  }

  @ActivityCallback
  private void savePdfResult(PluginCall call, ActivityResult result) {
    if (call == null) return;
    if (result.getResultCode() == Activity.RESULT_CANCELED) {
      call.reject("PDF save cancelled.", "SAVE_CANCELLED");
      return;
    }

    Uri destination = result.getData() == null ? null : result.getData().getData();
    String sourceValue = call.getString("fileUri");
    if (destination == null || sourceValue == null || sourceValue.isEmpty()) {
      call.reject("Could not access the selected save location.");
      return;
    }

    try (
      InputStream input = getContext().getContentResolver().openInputStream(Uri.parse(sourceValue));
      OutputStream output = getContext().getContentResolver().openOutputStream(destination, "w")
    ) {
      if (input == null || output == null) {
        call.reject("Could not open the source PDF or selected save location.");
        return;
      }
      byte[] buffer = new byte[8192];
      int count;
      while ((count = input.read(buffer)) != -1) {
        output.write(buffer, 0, count);
      }
      output.flush();
      JSObject response = new JSObject();
      response.put("uri", destination.toString());
      call.resolve(response);
    } catch (Exception error) {
      call.reject("Could not save the PDF.", error);
    }
  }
}
