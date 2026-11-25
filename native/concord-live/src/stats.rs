//! getStats() do envio com os nomes do WebRTC do navegador: o Electron monta
//! um RTCStatsReport com isto e usa o mesmo controlador de degraus
//! (screenAdaptSample.ts) e o mesmo painel "Sua transmissão" da live do Chromium.
//! O `timestamp` sai como o libwebrtc dá (`RTCStats::ToJson`: microssegundos); o
//! app troca pela hora de chegada em ms (`stampNativeStats`, ADR 0073).

use livekit::webrtc::stats::{
    CodecStats, MediaSourceStats, OutboundRtpStats, QualityLimitationReason, RemoteInboundRtpStats,
    RtcStats,
};
use serde_json::{json, Value};

fn limitation(reason: QualityLimitationReason) -> &'static str {
    match reason {
        QualityLimitationReason::None => "none",
        QualityLimitationReason::Cpu => "cpu",
        QualityLimitationReason::Bandwidth => "bandwidth",
        QualityLimitationReason::Other => "other",
    }
}

fn outbound(stat: &OutboundRtpStats) -> Value {
    let out = &stat.outbound;
    json!({
        "id": stat.rtc.id,
        "type": "outbound-rtp",
        "timestamp": stat.rtc.timestamp,
        "kind": stat.stream.kind,
        "ssrc": stat.stream.ssrc,
        "codecId": stat.stream.codec_id,
        "bytesSent": stat.sent.bytes_sent,
        "packetsSent": stat.sent.packets_sent,
        "mediaSourceId": out.media_source_id,
        "rid": out.rid,
        "active": out.active,
        "targetBitrate": out.target_bitrate,
        "frameWidth": out.frame_width,
        "frameHeight": out.frame_height,
        "framesPerSecond": out.frames_per_second,
        "framesSent": out.frames_sent,
        "framesEncoded": out.frames_encoded,
        "keyFramesEncoded": out.key_frames_encoded,
        "qpSum": out.qp_sum,
        "totalEncodeTime": out.total_encode_time,
        "totalPacketSendDelay": out.total_packet_send_delay,
        "retransmittedBytesSent": out.retransmitted_bytes_sent,
        "qualityLimitationReason": limitation(out.quality_limitation_reason),
        "nackCount": out.nack_count,
        "pliCount": out.pli_count,
        "firCount": out.fir_count,
        "encoderImplementation": out.encoder_implementation,
        "powerEfficientEncoder": out.power_efficient_encoder,
    })
}

fn media_source(stat: &MediaSourceStats) -> Value {
    json!({
        "id": stat.rtc.id,
        "type": "media-source",
        "timestamp": stat.rtc.timestamp,
        "kind": stat.source.kind,
        "width": stat.video.width,
        "height": stat.video.height,
        "frames": stat.video.frames,
        "framesPerSecond": stat.video.frames_per_second,
    })
}

fn codec(stat: &CodecStats) -> Value {
    json!({
        "id": stat.rtc.id,
        "type": "codec",
        "timestamp": stat.rtc.timestamp,
        "mimeType": stat.codec.mime_type,
        "payloadType": stat.codec.payload_type,
        "sdpFmtpLine": stat.codec.sdp_fmtp_line,
    })
}

fn remote_inbound(stat: &RemoteInboundRtpStats) -> Value {
    json!({
        "id": stat.rtc.id,
        "type": "remote-inbound-rtp",
        "timestamp": stat.rtc.timestamp,
        "kind": stat.stream.kind,
        "localId": stat.remote_inbound.local_id,
        "roundTripTime": stat.remote_inbound.round_trip_time,
        "fractionLost": stat.remote_inbound.fraction_lost,
        "packetsLost": stat.received.packets_lost,
    })
}

/// Só o que o controlador e o painel leem; o resto (transporte, ICE...) fica de fora.
pub fn to_json(stats: &[RtcStats]) -> Vec<Value> {
    stats
        .iter()
        .filter_map(|stat| match stat {
            RtcStats::OutboundRtp(s) => Some(outbound(s)),
            RtcStats::MediaSource(s) => Some(media_source(s)),
            RtcStats::Codec(s) => Some(codec(s)),
            RtcStats::RemoteInboundRtp(s) => Some(remote_inbound(s)),
            _ => None,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Vec<RtcStats> {
        let mut out = OutboundRtpStats::default();
        out.rtc.id = "OT1".into();
        out.stream.kind = "video".into();
        out.stream.codec_id = "C1".into();
        out.sent.bytes_sent = 1000;
        out.outbound.active = true;
        out.outbound.media_source_id = "S1".into();
        out.outbound.frames_per_second = 29.5;
        out.outbound.quality_limitation_reason = QualityLimitationReason::Bandwidth;
        out.outbound.encoder_implementation = "VAAPI H264".into();
        out.outbound.power_efficient_encoder = true;
        let mut codec = CodecStats::default();
        codec.rtc.id = "C1".into();
        codec.codec.mime_type = "video/H264".into();
        let mut source = MediaSourceStats::default();
        source.rtc.id = "S1".into();
        source.source.kind = "video".into();
        source.video.frames_per_second = 30.0;
        vec![RtcStats::OutboundRtp(out), RtcStats::Codec(codec), RtcStats::MediaSource(source)]
    }

    #[test]
    fn usa_os_nomes_do_webrtc_do_navegador() {
        let json = to_json(&sample());
        let out = &json[0];
        assert_eq!(out["type"], "outbound-rtp");
        assert_eq!(out["kind"], "video");
        assert_eq!(out["bytesSent"], 1000);
        assert_eq!(out["mediaSourceId"], "S1");
        assert_eq!(out["qualityLimitationReason"], "bandwidth");
        assert_eq!(out["encoderImplementation"], "VAAPI H264");
        assert_eq!(out["powerEfficientEncoder"], true);
        assert_eq!(json[2]["type"], "media-source");
        assert_eq!(json[2]["framesPerSecond"], 30.0);
    }

    #[test]
    fn descarta_o_que_ninguem_le() {
        let mut stats = sample();
        stats.push(RtcStats::Track);
        assert_eq!(to_json(&stats).len(), 3);
    }
}
