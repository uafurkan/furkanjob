"use client";

export default function InstagramLink() {
  return (
    <a
      href="https://www.instagram.com/paply.me/"
      target="_blank"
      rel="noopener noreferrer"
      className="ig-link"
      aria-label="@paply.me on Instagram"
      title="@paply.me"
    >
      <svg className="ig-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect className="ig-path" x="2.5" y="2.5" width="19" height="19" rx="5.5" />
        <circle className="ig-path" cx="12" cy="12" r="4.6" />
        <circle className="ig-dot" cx="17.4" cy="6.6" r="1.1" />
      </svg>
    </a>
  );
}
