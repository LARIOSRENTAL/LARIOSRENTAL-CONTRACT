import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const vendor=path.join(root,'www','vendor','pdfjs');
fs.mkdirSync(vendor,{recursive:true});
for(const name of ['pdf.mjs','pdf.worker.mjs']){
  fs.copyFileSync(path.join(root,'node_modules','pdfjs-dist','legacy','build',name),path.join(vendor,name));
}

const activity=path.join(root,'android','app','src','main','java','com','lariosrental','management','MainActivity.java');
const source=`package com.lariosrental.management;

import android.content.Context;
import android.os.Bundle;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    registerPlugin(LariosKioskPlugin.class);
    getBridge().getWebView().addJavascriptInterface(new LariosAndroidPrint(), "LariosAndroidPrint");
  }

  @Override
  public void onResume() {
    super.onResume();
    LariosKioskController.enter(this);
  }

  private class LariosAndroidPrint {
    @JavascriptInterface
    public void printDocument(final String requestedTitle) {
      runOnUiThread(() -> {
        WebView webView = getBridge().getWebView();
        PrintManager manager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
        String title = requestedTitle == null || requestedTitle.trim().isEmpty()
          ? "Contrato Larios Rental" : requestedTitle.trim();
        PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(title);
        manager.print(title, adapter, null);
      });
    }
  }
}
`;
fs.writeFileSync(activity,source);

console.log('Android PDF preview and print bridge prepared');
