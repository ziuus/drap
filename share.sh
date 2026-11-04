#!/usr/bin/env bash
# Share a file from Linux laptop to connected phone(s)
# Usage: ./share.sh <path_to_file>

if [ -z "$1" ]; then
    echo "Usage: ./share.sh <filepath>"
    echo "Example: ./share.sh photo.png"
    exit 1
fi

FILE="$1"
if [ ! -f "$FILE" ]; then
    echo "Error: File '$FILE' not found."
    exit 1
fi

FILENAME=$(basename "$FILE")
echo "==> Sending '$FILENAME' to connected phone(s)..."

RESPONSE=$(curl -s -F "file=@$FILE" "http://127.0.0.1:8080/api/share_to_phone")

if echo "$RESPONSE" | grep -q '"status":"success"'; then
    echo "✨ Successfully pushed '$FILENAME' to phone!"
else
    echo "Error uploading: $RESPONSE"
    exit 1
fi
