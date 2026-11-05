//! Captura via WASAPI *application loopback* (Windows 10 2004+), usando o
//! crate `wasapi`: o áudio de um processo (e filhos), ou de tudo menos ele,
//! sai em stdout como PCM float32 48 kHz estéreo intercalado.

use std::collections::VecDeque;
use std::io::Write;

use wasapi::{AudioClient, Direction, SampleType, StreamMode, WaveFormat};
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId;

use crate::args::Mode;

pub const SAMPLE_RATE: usize = 48_000;
pub const CHANNELS: usize = 2;

fn step<T, E: std::fmt::Display>(name: &str, result: Result<T, E>) -> Result<T, String> {
    result.map_err(|err| format!("{name}: {err}"))
}

/// PID dono da janela (incluir), ou o PID dado (incluir/excluir).
fn target(mode: &Mode) -> Result<(u32, bool), String> {
    match *mode {
        Mode::Window(hwnd) => {
            let mut pid = 0u32;
            unsafe { GetWindowThreadProcessId(HWND(hwnd as *mut _), Some(&mut pid)) };
            if pid == 0 {
                return Err(format!("janela {hwnd} não encontrada"));
            }
            Ok((pid, true))
        }
        Mode::Include(pid) => Ok((pid, true)),
        Mode::Exclude(pid) => Ok((pid, false)),
        Mode::Foreground | Mode::Overlay | Mode::MediaWatch | Mode::KeepTimer(_) => {
            Err("este modo não captura áudio".to_string())
        }
    }
}

/// Captura até stdout fechar (o Concord parou o compartilhamento).
pub fn run(mode: &Mode) -> Result<(), String> {
    step("initialize_mta", wasapi::initialize_mta().ok())?;
    let (pid, include) = target(mode)?;
    eprintln!("pid {pid} ({})", if include { "incluir" } else { "excluir" });

    let mut client = step(
        "application loopback",
        AudioClient::new_application_loopback_client(pid, include),
    )?;
    let format = WaveFormat::new(32, 32, &SampleType::Float, SAMPLE_RATE, CHANNELS, None);
    let mode = StreamMode::EventsShared { autoconvert: true, buffer_duration_hns: 0 };
    step("initialize_client", client.initialize_client(&format, &Direction::Capture, &mode))?;
    let event = step("set_get_eventhandle", client.set_get_eventhandle())?;
    let capture = step("get_audiocaptureclient", client.get_audiocaptureclient())?;
    step("start_stream", client.start_stream())?;

    // O processo pai lê esta linha para saber que a captura começou.
    eprintln!("ready");

    let mut out = std::io::stdout().lock();
    let mut queue: VecDeque<u8> = VecDeque::new();
    loop {
        // Sem som o evento pode não disparar: o timeout só mantém o laço vivo.
        let _ = event.wait_for_event(200);
        while step("get_next_packet_size", capture.get_next_packet_size())?.unwrap_or(0) > 0 {
            step("read_from_device", capture.read_from_device_to_deque(&mut queue))?;
        }
        if queue.is_empty() {
            continue;
        }
        let (a, b) = queue.as_slices();
        let written = out.write_all(a).and_then(|_| out.write_all(b)).and_then(|_| out.flush());
        queue.clear();
        if written.is_err() {
            // stdout fechado: o Concord parou o compartilhamento.
            let _ = client.stop_stream();
            return Ok(());
        }
    }
}
