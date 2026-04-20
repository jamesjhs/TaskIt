package com.jamesjhs.crystallise.ui.main

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.jamesjhs.crystallise.R
import com.jamesjhs.crystallise.api.TaskNote
import java.text.SimpleDateFormat
import java.util.*

class NoteAdapter(private val notes: List<TaskNote>) : RecyclerView.Adapter<NoteAdapter.NoteViewHolder>() {

    class NoteViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val author: TextView = view.findViewById(R.id.noteAuthor)
        val date: TextView = view.findViewById(R.id.noteDate)
        val content: TextView = view.findViewById(R.id.noteContent)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): NoteViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_note, parent, false)
        return NoteViewHolder(view)
    }

    override fun onBindViewHolder(holder: NoteViewHolder, position: Int) {
        val note = notes[position]
        holder.author.text = note.username
        holder.content.text = note.note
        
        val sdf = SimpleDateFormat("MMM d, HH:mm", Locale.getDefault())
        holder.date.text = sdf.format(Date(note.createdAt))
    }

    override fun getItemCount() = notes.size
}
