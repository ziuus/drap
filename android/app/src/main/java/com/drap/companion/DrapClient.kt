package com.drap.companion

import android.content.Context
import android.net.Uri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okio.BufferedSink
import okio.source
import java.io.InputStream
import java.util.concurrent.TimeUnit

class DrapClient(private val context: Context) {

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    var desktopHost: String = "10.154.190.201:8080"

    suspend fun checkConnection(host: String = desktopHost): Boolean = withContext(Dispatchers.IO) {
        try {
            val url = "http://$host/api/status"
            val request = Request.Builder().url(url).build()
            val response = httpClient.newCall(request).execute()
            response.isSuccessful
        } catch (e: Exception) {
            false
        }
    }

    suspend fun uploadMedia(item: MediaItem, host: String = desktopHost): Boolean = withContext(Dispatchers.IO) {
        try {
            val contentResolver = context.contentResolver
            val inputStream: InputStream? = contentResolver.openInputStream(item.uri)
            if (inputStream == null) return@withContext false

            val requestBody = object : RequestBody() {
                override fun contentType() = item.mimeType.toMediaTypeOrNull()

                override fun writeTo(sink: BufferedSink) {
                    inputStream.source().use { source ->
                        sink.writeAll(source)
                    }
                }
            }

            val multipartBody = MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart("file", item.name, requestBody)
                .addFormDataPart("y", "0.5")
                .build()

            val request = Request.Builder()
                .url("http://$host/api/upload")
                .post(multipartBody)
                .build()

            val response = httpClient.newCall(request).execute()
            response.isSuccessful
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }
}
