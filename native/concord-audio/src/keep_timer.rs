//! Windows 11 pode ignorar o temporizador fino de um processo com a janela
//! totalmente coberta; a captura de tela do Chromium cai para 32 fps. Pede ao
//! Windows para manter o temporizador do Concord (docs/adr/0050). Roda e sai.

use std::ffi::c_void;
use std::mem::size_of;

use windows::Win32::Foundation::CloseHandle;
use windows::Win32::System::Threading::{
    OpenProcess, ProcessPowerThrottling, SetProcessInformation, PROCESS_POWER_THROTTLING_CURRENT_VERSION,
    PROCESS_POWER_THROTTLING_IGNORE_TIMER_RESOLUTION, PROCESS_POWER_THROTTLING_STATE, PROCESS_SET_INFORMATION,
};

pub fn run(pid: u32) -> Result<(), String> {
    // ControlMask com o bit e StateMask sem ele = não ignorar o pedido de temporizador.
    let state = PROCESS_POWER_THROTTLING_STATE {
        Version: PROCESS_POWER_THROTTLING_CURRENT_VERSION,
        ControlMask: PROCESS_POWER_THROTTLING_IGNORE_TIMER_RESOLUTION,
        StateMask: 0,
    };
    unsafe {
        let process =
            OpenProcess(PROCESS_SET_INFORMATION, false, pid).map_err(|err| format!("OpenProcess: {err}"))?;
        let result = SetProcessInformation(
            process,
            ProcessPowerThrottling,
            &state as *const _ as *const c_void,
            size_of::<PROCESS_POWER_THROTTLING_STATE>() as u32,
        );
        let _ = CloseHandle(process);
        result.map_err(|err| format!("SetProcessInformation: {err}"))
    }
}
