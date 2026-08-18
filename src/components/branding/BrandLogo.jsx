import { useEffect, useState } from "react";
import lightLogo from "../../assets/branding/the-hub-logo-light.png";
import darkLogo from "../../assets/branding/the-hub-logo-dark.png";
import { APP_LOGO_URL } from "../../brand";
import "./BrandLogo.css";

const ALT = "The Hub – Powering Lead Ventures";

export default function BrandLogo({ appearance, size = "standard", className = "" }) {
  const detected = appearance || (typeof window !== "undefined" ? localStorage.getItem("lv-agent-theme") : "current") || "current";
  const preferred = detected === "light" ? lightLogo : darkLogo;
  const alternate = detected === "light" ? darkLogo : lightLogo;
  const [source, setSource] = useState(preferred);
  useEffect(() => setSource(preferred), [preferred]);
  function fallback() {
    if (source === preferred && alternate !== preferred) setSource(alternate);
    else if (source !== APP_LOGO_URL) setSource(APP_LOGO_URL);
  }
  return <img className={`brand-logo logo brand-logo-${size} ${className}`.trim()} src={source} alt={ALT} onError={fallback} />;
}
