//! Linha de comando do helper.
//!
//!   concord-audio window <hwnd>    som do processo dono da janela (e filhos)
//!   concord-audio include <pid>    som do processo <pid> (e filhos)
//!   concord-audio exclude <pid>    som do sistema todo, menos <pid> (e filhos)
//!   concord-audio foreground       informa a janela em tela cheia (overlay de jogo)
//!   concord-audio overlay          janela nativa do overlay de jogo (estado em stdin)
//!   concord-audio media-watch      sessões de mídia do Windows (música em atividade)
//!   concord-audio keep-timer <pid> mantém o temporizador de <pid> com a janela coberta

#[derive(Debug, PartialEq, Eq)]
pub enum Mode {
    Window(u64),
    Include(u32),
    Exclude(u32),
    KeepTimer(u32),
    Foreground,
    Overlay,
    MediaWatch,
}

pub fn parse_args(args: &[String]) -> Result<Mode, String> {
    let usage = || "uso: concord-audio window <hwnd> | include <pid> | exclude <pid> | keep-timer <pid> | foreground | overlay | media-watch".to_string();
    match args {
        [mode] if mode == "foreground" => Ok(Mode::Foreground),
        [mode] if mode == "overlay" => Ok(Mode::Overlay),
        [mode] if mode == "media-watch" => Ok(Mode::MediaWatch),
        [mode, value] => {
            let number = |v: &str| v.parse::<u64>().map_err(|_| format!("número inválido: {v}"));
            match mode.as_str() {
                "window" => match number(value)? {
                    0 => Err("hwnd não pode ser 0".to_string()),
                    hwnd => Ok(Mode::Window(hwnd)),
                },
                "include" | "exclude" | "keep-timer" => {
                    let pid = u32::try_from(number(value)?).map_err(|_| format!("pid inválido: {value}"))?;
                    if pid == 0 {
                        return Err("pid não pode ser 0".to_string());
                    }
                    Ok(match mode.as_str() {
                        "include" => Mode::Include(pid),
                        "exclude" => Mode::Exclude(pid),
                        _ => Mode::KeepTimer(pid),
                    })
                }
                _ => Err(usage()),
            }
        }
        _ => Err(usage()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn janela_por_hwnd() {
        assert_eq!(parse_args(&args(&["window", "132456"])), Ok(Mode::Window(132456)));
    }

    #[test]
    fn incluir_e_excluir_processo() {
        assert_eq!(parse_args(&args(&["include", "4242"])), Ok(Mode::Include(4242)));
        assert_eq!(parse_args(&args(&["exclude", "77"])), Ok(Mode::Exclude(77)));
    }

    #[test]
    fn recusa_entradas_invalidas() {
        assert!(parse_args(&args(&[])).is_err());
        assert!(parse_args(&args(&["window"])).is_err());
        assert!(parse_args(&args(&["window", "0"])).is_err());
        assert!(parse_args(&args(&["include", "abc"])).is_err());
        assert!(parse_args(&args(&["include", "0"])).is_err());
        assert!(parse_args(&args(&["include", "99999999999"])).is_err());
        assert!(parse_args(&args(&["tocar", "1"])).is_err());
    }

    #[test]
    fn manter_o_temporizador_de_um_processo() {
        assert_eq!(parse_args(&args(&["keep-timer", "4242"])), Ok(Mode::KeepTimer(4242)));
        assert!(parse_args(&args(&["keep-timer"])).is_err());
        assert!(parse_args(&args(&["keep-timer", "0"])).is_err());
        assert!(parse_args(&args(&["keep-timer", "abc"])).is_err());
    }

    #[test]
    fn modo_foreground() {
        assert_eq!(parse_args(&args(&["foreground"])), Ok(Mode::Foreground));
        assert!(parse_args(&args(&["foreground", "1"])).is_err());
    }

    #[test]
    fn modo_overlay() {
        assert_eq!(parse_args(&args(&["overlay"])), Ok(Mode::Overlay));
        assert!(parse_args(&args(&["overlay", "1"])).is_err());
    }

    #[test]
    fn modo_media_watch() {
        assert_eq!(parse_args(&args(&["media-watch"])), Ok(Mode::MediaWatch));
        assert!(parse_args(&args(&["media-watch", "1"])).is_err());
    }
}
