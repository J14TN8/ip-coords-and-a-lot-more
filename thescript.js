(() => {
  let lastIp = null;
  const ipCache = new Map();

  async function fetchFromFreeIpApi(ip) {
    const endpoint = new URL("/api/json/" + encodeURIComponent(ip), "https://freeipapi.com");
    const res = await fetch(endpoint.href);
    if (!res.ok) throw new Error("FreeIPAPI HTTP " + res.status);
    const d = await res.json();

    return {
      IP: d.ipAddress + " (IPv" + d.ipVersion + ")",
      City: d.cityName || "N/A",
      State: d.regionName || "N/A",
      Country: (d.countryName || "N/A") + " (" + (d.countryCode || "") + ")",
      Postal: d.zipCode || "N/A",
      ISP_or_ASN: (d.asnOrganization || "Unknown") + (d.asn ? " (AS" + d.asn + ")" : ""),
      Coordinates: d.latitude + ", " + d.longitude,
      Timezone: Array.isArray(d.timeZones) ? d.timeZones.at(0) : "N/A",
      IsProxy: d.isProxy ? "Yes" : "No"
    };
  }

  async function fetchFromIpApiCo(ip) {
    const endpoint = new URL("/" + encodeURIComponent(ip) + "/json/", "https://ipapi.co");
    const res = await fetch(endpoint.href);
    if (!res.ok) throw new Error("ipapi.co HTTP " + res.status);
    const d = await res.json();
    if (d.error) throw new Error(d.reason || "ipapi.co error");

    return {
      IP: d.ip + " (" + d.version + ")",
      City: d.city || "N/A",
      State: (d.region || "N/A") + " (" + (d.region_code || "") + ")",
      Country: (d.country_name || "N/A") + " (" + (d.country_code || "") + ")",
      Postal: d.postal || "N/A",
      ISP_or_ASN: (d.org || "Unknown") + (d.asn ? " (" + d.asn + ")" : ""),
      Coordinates: d.latitude + ", " + d.longitude,
      Timezone: d.timezone || "N/A",
      UTC_Offset: d.utc_offset || "N/A"
    };
  }

  async function lookupIp(ip) {
    if (ipCache.has(ip)) {
      console.log("%c=== Peer Info (Cached) ===", "color: #4ade80; font-weight: bold;");
      console.table(ipCache.get(ip));
      return;
    }

    console.log("%c[WebRTC] Peer IP detected: " + ip + " — fetching location...", "color: #eab308; font-weight: bold;");

    try {
      let info;
      try {
        info = await fetchFromFreeIpApi(ip);
      } catch (primaryErr) {
        console.warn("[Geolocation] Primary API limited/failed (" + primaryErr.message + "), switching to backup...");
        info = await fetchFromIpApiCo(ip);
      }

      ipCache.set(ip, info);
      console.log("%c=== Peer Geolocation & Provider Info ===", "color: #4ade80; font-weight: bold; font-size: 13px;");
      console.table(info);
    } catch (err) {
      console.error("[Geolocation] All providers failed:", err.message);
    }
  }

  function parseCandidateLine(str) {
    if (!str) return;
    for (const line of str.split(/\r?\n/)) {
      if (line.includes("candidate:")) {
        const parts = line.trim().split(/\s+/);
        const ip = parts.at(4);
        const type = parts.at(7);

        if (!ip || ip.endsWith(".local")) continue;

        if (type === "srflx" && ip !== lastIp) {
          lastIp = ip;
          lookupIp(ip);
        }
      }
    }
  }

  const origAddIce = window.RTCPeerConnection.prototype.addIceCandidate;
  window.RTCPeerConnection.prototype.addIceCandidate = function (candidate, ...rest) {
    if (candidate?.candidate) parseCandidateLine(candidate.candidate);
    return origAddIce.apply(this, [candidate, ...rest]);
  };

  const origSetRemote = window.RTCPeerConnection.prototype.setRemoteDescription;
  window.RTCPeerConnection.prototype.setRemoteDescription = function (desc, ...rest) {
    if (desc?.sdp) parseCandidateLine(desc.sdp);
    return origSetRemote.apply(this, [desc, ...rest]);
  };

  console.log("%c[WebRTC Hook Active] FreeIPAPI + ipapi.co fallback ready!", "color: #60a5fa; font-weight: bold;");
})();
