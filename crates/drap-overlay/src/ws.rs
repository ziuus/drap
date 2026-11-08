use tokio::time::{sleep, Duration};
use tokio_tungstenite::connect_async;
use futures_util::StreamExt;
use std::sync::mpsc::Sender;

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct WsMessage {
    pub msg_type: String,
    pub edge: Option<String>,
    pub corner: Option<String>,
    pub coord: Option<f64>,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub proximity: Option<f64>,
    pub pressure: Option<f64>,
    pub vy: Option<f64>,
    pub filename: Option<String>,
    pub size_str: Option<String>,
    pub size_bytes: Option<u64>,
    pub theme: Option<String>,
}

pub fn format_bytes(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{} B", bytes)
    } else if bytes < 1024 * 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else if bytes < 1024 * 1024 * 1024 {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    } else {
        format!("{:.1} GB", bytes as f64 / (1024.0 * 1024.0 * 1024.0))
    }
}

fn parse_f64(val: Option<&serde_json::Value>) -> Option<f64> {
    let val = val?;
    if let Some(n) = val.as_f64() {
        return Some(n);
    }
    if let Some(s) = val.as_str() {
        if let Ok(n) = s.parse::<f64>() {
            return Some(n);
        }
    }
    None
}

impl WsMessage {
    pub fn from_json(v: &serde_json::Value) -> Option<Self> {
        let msg_type = v.get("type")?.as_str()?.to_string();

        let edge = v.get("edge").and_then(|e| e.as_str()).map(|s| s.to_string());
        let corner = v.get("corner").and_then(|c| c.as_str()).map(|s| s.to_string());

        let coord = parse_f64(v.get("coord")).or_else(|| parse_f64(v.get("y")));
        let x = parse_f64(v.get("x"));
        let y = parse_f64(v.get("y"));
        let proximity = parse_f64(v.get("proximity"));
        let pressure = parse_f64(v.get("pressure"));
        let vy = parse_f64(v.get("vy")).or_else(|| parse_f64(v.get("velocity_y")));

        let filename = v.get("filename")
            .or_else(|| v.get("title"))
            .and_then(|f| f.as_str())
            .map(|s| s.to_string());

        let (size_bytes, size_str) = if let Some(s) = v.get("size") {
            if let Some(bytes) = s.as_u64() {
                (Some(bytes), Some(format_bytes(bytes)))
            } else if let Some(num) = s.as_f64() {
                let bytes = num as u64;
                (Some(bytes), Some(format_bytes(bytes)))
            } else if let Some(str_val) = s.as_str() {
                if !str_val.is_empty() {
                    (None, Some(str_val.to_string()))
                } else {
                    (None, None)
                }
            } else {
                (None, None)
            }
        } else {
            (None, None)
        };

        let theme = v.get("theme").and_then(|t| t.as_str()).map(|s| s.to_string());

        Some(Self {
            msg_type,
            edge,
            corner,
            coord,
            x,
            y,
            proximity,
            pressure,
            vy,
            filename,
            size_str,
            size_bytes,
            theme,
        })
    }
}

pub fn start_ws_client(tx: Sender<WsMessage>) {
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("Failed to build Tokio runtime");

        rt.block_on(async move {
            let url = "ws://127.0.0.1:8080/ws";
            loop {
                match connect_async(url).await {
                    Ok((ws_stream, _)) => {
                        println!("[drap Rust Overlay] Connected to gateway WebSocket.");
                        let (_, mut read) = ws_stream.split();
                        while let Some(msg_result) = read.next().await {
                            match msg_result {
                                Ok(tokio_tungstenite::tungstenite::Message::Text(text)) => {
                                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                                        if let Some(msg) = WsMessage::from_json(&v) {
                                            let _ = tx.send(msg);
                                            glib::idle_add_once(|| {
                                                crate::dispatch();
                                            });
                                        }
                                    }
                                }
                                Ok(tokio_tungstenite::tungstenite::Message::Close(_)) => {
                                    break;
                                }
                                Err(_) => {
                                    break;
                                }
                                _ => {}
                            }
                        }
                    }
                    Err(_) => {
                        sleep(Duration::from_millis(1500)).await;
                    }
                }
                sleep(Duration::from_millis(1000)).await;
            }
        });
    });
}
