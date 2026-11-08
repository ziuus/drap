package com.drap.companion

import android.Manifest
import android.content.ContentUris
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import com.drap.companion.databinding.ActivityMainBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var drapClient: DrapClient
    private lateinit var galleryAdapter: GalleryAdapter
    private val galleryItems = mutableListOf<MediaItem>()

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val granted = permissions.entries.all { it.value }
        if (granted) {
            loadDeviceGallery()
        } else {
            binding.tvEmpty.visibility = View.VISIBLE
            binding.tvEmpty.text = "Permission denied. Please grant photo access in Android settings."
            Toast.makeText(this, "Photo permissions required to show phone gallery", Toast.LENGTH_LONG).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        drapClient = DrapClient(this)
        setupRecyclerView()
        setupListeners()

        checkAndRequestPermissions()
        checkDesktopConnection()
        handleIncomingShareIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIncomingShareIntent(intent)
    }

    private fun setupRecyclerView() {
        galleryAdapter = GalleryAdapter(galleryItems) { count ->
            if (count > 0) {
                binding.btnBeam.text = "Beam $count Photo${if (count > 1) "s" else ""} to Desktop"
                binding.btnBeam.isEnabled = true
            } else {
                binding.btnBeam.text = getString(R.string.action_beam)
                binding.btnBeam.isEnabled = false
            }
        }

        binding.rvGallery.apply {
            layoutManager = GridLayoutManager(this@MainActivity, 3)
            adapter = galleryAdapter
            setHasFixedSize(true)
        }
    }

    private fun setupListeners() {
        binding.btnBeam.setOnClickListener {
            val selected = galleryAdapter.getSelectedItems()
            if (selected.isEmpty()) {
                Toast.makeText(this, "Tap photos above to select them", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            beamPhotosToDesktop(selected)
        }
    }

    private fun checkAndRequestPermissions() {
        val permissionsToRequest = mutableListOf<String>()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_IMAGES) != PackageManager.PERMISSION_GRANTED) {
                permissionsToRequest.add(Manifest.permission.READ_MEDIA_IMAGES)
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_VIDEO) != PackageManager.PERMISSION_GRANTED) {
                permissionsToRequest.add(Manifest.permission.READ_MEDIA_VIDEO)
            }
        } else {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                permissionsToRequest.add(Manifest.permission.READ_EXTERNAL_STORAGE)
            }
        }

        if (permissionsToRequest.isNotEmpty()) {
            permissionLauncher.launch(permissionsToRequest.toTypedArray())
        } else {
            loadDeviceGallery()
        }
    }

    private fun loadDeviceGallery() {
        lifecycleScope.launch {
            val items = withContext(Dispatchers.IO) {
                queryMediaStorePhotos()
            }
            galleryItems.clear()
            galleryItems.addAll(items)
            galleryAdapter.notifyDataSetChanged()

            binding.tvEmpty.visibility = if (items.isEmpty()) View.VISIBLE else View.GONE
            binding.tvGallerySubtitle.text = "Full Phone Camera Roll (${items.size} photos found)"
        }
    }

    private fun queryMediaStorePhotos(): List<MediaItem> {
        val photos = mutableListOf<MediaItem>()
        val projection = arrayOf(
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.DISPLAY_NAME,
            MediaStore.Images.Media.SIZE,
            MediaStore.Images.Media.MIME_TYPE,
            MediaStore.Images.Media.DATE_ADDED
        )

        val sortOrder = "${MediaStore.Images.Media.DATE_ADDED} DESC"

        val query = contentResolver.query(
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            projection,
            null,
            null,
            sortOrder
        )

        query?.use { cursor ->
            val idColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
            val nameColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME)
            val sizeColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.SIZE)
            val mimeColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.MIME_TYPE)
            val dateColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED)

            while (cursor.moveToNext()) {
                val id = cursor.getLong(idColumn)
                val name = cursor.getString(nameColumn) ?: "photo_$id.jpg"
                val size = cursor.getLong(sizeColumn)
                val mimeType = cursor.getString(mimeColumn) ?: "image/jpeg"
                val dateAdded = cursor.getLong(dateColumn)

                val contentUri: Uri = ContentUris.withAppendedId(
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                    id
                )

                photos.add(MediaItem(id, contentUri, name, size, mimeType, dateAdded))
            }
        }

        return photos
    }

    private fun checkDesktopConnection() {
        lifecycleScope.launch {
            binding.tvStatus.text = getString(R.string.status_searching)
            binding.statusDot.setBackgroundResource(R.drawable.bg_dot_green)

            val isOnline = drapClient.checkConnection()
            if (isOnline) {
                binding.tvStatus.text = getString(R.string.status_connected)
                binding.statusDot.setBackgroundResource(R.drawable.bg_dot_green)
            } else {
                binding.tvStatus.text = getString(R.string.status_disconnected)
                binding.statusDot.setBackgroundResource(R.drawable.bg_dot_green)
            }
        }
    }

    private fun beamPhotosToDesktop(items: List<MediaItem>) {
        binding.btnBeam.isEnabled = false
        binding.btnBeam.text = "Beaming ${items.size} file(s)…"

        lifecycleScope.launch {
            var successCount = 0
            for (item in items) {
                val ok = drapClient.uploadMedia(item)
                if (ok) successCount++
            }

            if (successCount == items.size) {
                Toast.makeText(
                    this@MainActivity,
                    "✨ Beamed $successCount photo(s) to Linux Desktop!",
                    Toast.LENGTH_LONG
                ).show()
                galleryAdapter.clearSelection()
            } else {
                Toast.makeText(
                    this@MainActivity,
                    "Transferred $successCount / ${items.size} files. Check Wi-Fi connection.",
                    Toast.LENGTH_LONG
                ).show()
            }

            binding.btnBeam.isEnabled = true
            binding.btnBeam.text = getString(R.string.action_beam)
        }
    }

    private fun handleIncomingShareIntent(intent: Intent?) {
        if (intent == null) return
        val action = intent.action
        val type = intent.type ?: return

        if (Intent.ACTION_SEND == action && type.startsWith("image/")) {
            val imageUri = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
            if (imageUri != null) {
                val item = MediaItem(System.currentTimeMillis(), imageUri, "Shared_Photo.jpg", 0, type, System.currentTimeMillis(), isSelected = true)
                beamPhotosToDesktop(listOf(item))
            }
        } else if (Intent.ACTION_SEND_MULTIPLE == action && type.startsWith("image/")) {
            val imageUris = intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
            if (!imageUris.isNullOrEmpty()) {
                val items = imageUris.mapIndexed { idx, uri ->
                    MediaItem(System.currentTimeMillis() + idx, uri, "Shared_Photo_$idx.jpg", 0, type, System.currentTimeMillis(), isSelected = true)
                }
                beamPhotosToDesktop(items)
            }
        }
    }
}
