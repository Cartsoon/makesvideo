# Knowledge Base Seed Files

This folder contains the seed content for the RAG (Retrieval Augmented Generation) system.

## Structure

- `style_guides/` - Video style guides and best practices
- `checklists/` - Production checklists and workflows
- `templates/` - Script and storyboard templates
- `examples/` - Example scripts and case studies

## File Formats

Supported formats:
- `.md` - Markdown files
- `.txt` - Plain text files
- `.json` - JSON files (array of strings or object with `text` field)

## Tags

You can add tags to any file by including them on the first line:

```
tags: монтаж, shorts, sfx
Your content here...
```

## Reindexing

To reindex the knowledge base after adding new files:

```bash
curl -X POST http://localhost:5000/api/kb/reindex
```

Or use the API endpoint `/api/kb/reindex` from the application.
