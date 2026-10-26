// Update Management Service for PédiaDrill
// Checks GitHub Releases for new APK versions, notifies the user, and triggers direct download.

export const CURRENT_APP_VERSION = '1.3.3';
export const GITHUB_REPO = 'lkmqji/qcm-p-diatrie';
export const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
export const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours auto-check cooldown
export const LAST_CHECK_KEY = 'pedia_last_update_check_ts';

export class UpdateService {
  constructor() {
    this.currentVersion = CURRENT_APP_VERSION;
    this.latestRelease = null;
    this.isChecking = false;
  }

  /**
   * Compare two semantic versions (e.g. "1.3.1" vs "1.3.0" or "v1.4" vs "1.3.0")
   * Returns:
   *   1 if v1 > v2
   *  -1 if v1 < v2
   *   0 if v1 === v2
   */
  compareVersions(v1, v2) {
    if (!v1 || !v2) return 0;
    const clean = v => String(v).trim().replace(/^[vV]/, '');
    const parts1 = clean(v1).split('.').map(n => parseInt(n, 10) || 0);
    const parts2 = clean(v2).split('.').map(n => parseInt(n, 10) || 0);

    const maxLength = Math.max(parts1.length, parts2.length);
    for (let i = 0; i < maxLength; i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    return 0;
  }

  /**
   * Check GitHub API for the latest release
   * @param {boolean} manual Whether this check was triggered manually by user
   */
  async checkForUpdates(manual = false) {
    if (this.isChecking) return;

    // Cooldown check for automatic background check
    const now = Date.now();
    if (!manual) {
      try {
        const lastCheck = parseInt(localStorage.getItem(LAST_CHECK_KEY) || '0', 10);
        if (now - lastCheck < UPDATE_CHECK_INTERVAL_MS) {
          return; // Skipped, cooldown active
        }
      } catch (e) {
        // Ignore localStorage error
      }
    }

    this.isChecking = true;
    this.updateStatusText('Vérification en cours...', true);

    try {
      const response = await fetch(GITHUB_API_URL, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'PediaDrill-App'
        }
      });

      try {
        localStorage.setItem(LAST_CHECK_KEY, String(now));
      } catch (e) {}

      if (response.status === 404) {
        // No releases published yet on GitHub
        this.updateStatusText(`Application à jour (v${this.currentVersion}) - Aucun tag sur GitHub.`);
        if (manual) {
          this.showToast(`✅ Vous utilisez la version la plus récente (v${this.currentVersion}).`);
        }
        return;
      }

      if (!response.ok) {
        throw new Error(`Erreur GitHub API (${response.status})`);
      }

      const release = await response.json();
      this.latestRelease = release;

      const remoteTag = release.tag_name || release.name || '';
      const isNewer = this.compareVersions(remoteTag, this.currentVersion) > 0;

      if (isNewer) {
        this.updateStatusText(`🎉 Nouvelle version disponible : ${remoteTag}`);
        this.openUpdateModal(release);
      } else {
        this.updateStatusText(`✅ Version à jour (v${this.currentVersion})`);
        if (manual) {
          this.showToast(`✅ Vous êtes à jour avec la dernière version (v${this.currentVersion}).`);
        }
      }
    } catch (err) {
      console.warn('[UpdateService] Check failed:', err);
      this.updateStatusText('Impossible de joindre GitHub');
      if (manual) {
        this.showToast('⚠️ Impossible de vérifier les mises à jour (vérifiez votre connexion Internet).');
      }
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Find direct APK asset download URL or fallback to release webpage
   */
  getApkDownloadUrl(release) {
    if (!release) return `https://github.com/${GITHUB_REPO}/releases/latest`;

    if (Array.isArray(release.assets) && release.assets.length > 0) {
      // Prioritize PediaDrill.apk or any .apk file
      const apkAsset = release.assets.find(a => a.name && a.name.toLowerCase().endsWith('.apk'));
      if (apkAsset && apkAsset.browser_download_url) {
        return apkAsset.browser_download_url;
      }
    }

    // Fallback to release page
    return release.html_url || `https://github.com/${GITHUB_REPO}/releases/latest`;
  }

  /**
   * Trigger direct APK download or open in external system browser on Android
   */
  downloadAndInstall(url) {
    if (!url) return;

    try {
      // On Android Capacitor native shell, open in system browser to trigger download manager
      if (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform()) {
        window.open(url, '_system');
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (e) {
      window.location.href = url;
    }
  }

  /**
   * Displays the update modal with release details
   */
  openUpdateModal(release) {
    const modal = document.getElementById('modal-app-update');
    if (!modal) return;

    const currVersionEl = document.getElementById('update-modal-curr-version');
    const newVersionEl = document.getElementById('update-modal-new-version');
    const dateEl = document.getElementById('update-modal-date');
    const notesEl = document.getElementById('update-modal-notes');
    const btnDownload = document.getElementById('btn-download-update');

    const newTag = release.tag_name || release.name || 'Nouvelle version';
    if (currVersionEl) currVersionEl.textContent = `v${this.currentVersion}`;
    if (newVersionEl) newVersionEl.textContent = newTag;

    if (dateEl && release.published_at) {
      const d = new Date(release.published_at);
      dateEl.textContent = `Publiée le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`;
    }

    if (notesEl) {
      const rawBody = (release.body || 'Mise à jour de maintenance et améliorations de performances.').trim();
      // Format simple markdown lines (bullet points, bold)
      const formatted = rawBody
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/^[\*\-]\s+(.*)$/gm, '<li>$1</li>')
        .replace(/\n\n/g, '<br><br>');

      notesEl.innerHTML = formatted.includes('<li>') ? `<ul>${formatted}</ul>` : formatted;
    }

    const downloadUrl = this.getApkDownloadUrl(release);
    if (btnDownload) {
      btnDownload.onclick = () => {
        this.downloadAndInstall(downloadUrl);
        modal.style.display = 'none';
        this.showToast('🚀 Téléchargement de l\'APK en cours dans vos notifications Android...');
      };
    }

    modal.style.display = 'flex';
  }

  closeUpdateModal() {
    const modal = document.getElementById('modal-app-update');
    if (modal) modal.style.display = 'none';
  }

  updateStatusText(msg, isLoading = false) {
    const statusEl = document.getElementById('settings-update-status');
    const iconEl = document.getElementById('icon-check-updates');
    if (statusEl) statusEl.textContent = msg;
    if (iconEl) {
      if (isLoading) iconEl.classList.add('spin-animation');
      else iconEl.classList.remove('spin-animation');
    }
  }

  showToast(message) {
    const existing = document.getElementById('pedia-toast-alert');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'pedia-toast-alert';
    toast.className = 'pedia-toast-alert';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('show');
    }, 50);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }
}

export const updateService = new UpdateService();
