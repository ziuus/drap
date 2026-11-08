package com.drap.companion

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import com.bumptech.glide.load.resource.drawable.DrawableTransitionOptions

class GalleryAdapter(
    private val items: MutableList<MediaItem>,
    private val onSelectionChanged: (selectedCount: Int) -> Unit
) : RecyclerView.Adapter<GalleryAdapter.ViewHolder>() {

    inner class ViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        val ivThumbnail: ImageView = itemView.findViewById(R.id.ivThumbnail)
        val scrimSelection: View = itemView.findViewById(R.id.scrimSelection)
        val ivCheckmark: ImageView = itemView.findViewById(R.id.ivCheckmark)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_gallery_photo, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val item = items[position]

        Glide.with(holder.itemView.context)
            .load(item.uri)
            .centerCrop()
            .transition(DrawableTransitionOptions.withCrossFade(150))
            .into(holder.ivThumbnail)

        updateSelectionState(holder, item)

        holder.itemView.setOnClickListener {
            item.isSelected = !item.isSelected
            updateSelectionState(holder, item)
            onSelectionChanged(items.count { it.isSelected })
        }
    }

    private fun updateSelectionState(holder: ViewHolder, item: MediaItem) {
        holder.scrimSelection.visibility = if (item.isSelected) View.VISIBLE else View.GONE
        holder.ivCheckmark.visibility = if (item.isSelected) View.VISIBLE else View.GONE
    }

    override fun getItemCount(): Int = items.size

    fun getSelectedItems(): List<MediaItem> = items.filter { it.isSelected }

    fun selectAll() {
        items.forEach { it.isSelected = true }
        notifyDataSetChanged()
        onSelectionChanged(items.size)
    }

    fun clearSelection() {
        items.forEach { it.isSelected = false }
        notifyDataSetChanged()
        onSelectionChanged(0)
    }

    fun updateData(newItems: List<MediaItem>) {
        items.clear()
        items.addAll(newItems)
        notifyDataSetChanged()
    }
}
