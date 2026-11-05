use serde::Deserialize;
use tokio::time::{sleep, Duration};
use tokio_tungstenite::connect_async;
use futures_util::StreamExt;
use std::sync::mpsc::Sender;

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct WsMessage {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub edge: Option<String>,
    pub corner: Option<String>,
    pub coord: Option<f64>,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub proximity: Option<f64>,
    pub velocity_y: Option<f64>,
    pub filename: Option<String>,
    pub size: Option<u64>,
    pub theme: Option<String>,
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
                                    if let Ok(msg) = serde_json::from_str::<WsMessage>(&text) {
                                        let _ = tx.send(msg);
                                        glib::idle_add_once(|| {
                                            crate::wakeup();
                                        });
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
