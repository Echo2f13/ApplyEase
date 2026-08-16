document.addEventListener("DOMContentLoaded", () => {
  console.log("ApplyEase popup: DOM loaded");

  // Quick action buttons
  document.getElementById("open-dashboard")?.addEventListener("click", () => {
    chrome.tabs.create({ url: "http://localhost:3000/dashboard" });
  });
  
  document.getElementById("open-cover-letter")?.addEventListener("click", () => {
    chrome.tabs.create({ url: "http://localhost:3000/dashboard?tab=tools" });
  });
  
  document.getElementById("open-resume")?.addEventListener("click", () => {
    chrome.tabs.create({ url: "http://localhost:3000/dashboard?tab=links" });
  });

  const renderMatch = (token) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0]) return;
      
      const render = (match) => {
        const panel = document.getElementById("match-panel");
        const pct = document.getElementById("match-percent");
        const barFill = document.getElementById("match-bar-fill");
        const mat = document.getElementById("match-matching");
        const mis = document.getElementById("match-missing");
        
        panel.classList.add("visible");
        
        const percent = match.percent ?? 0;
        pct.textContent = `${percent}%`;
        barFill.style.width = `${percent}%`;
        
        // Matching keywords
        mat.innerHTML = "";
        (match.matchingWords || []).slice(0, 20).forEach((w) => {
          const chip = document.createElement("span");
          chip.className = "chip chip-match";
          chip.textContent = w;
          mat.appendChild(chip);
        });
        
        // Show placeholder if no matching keywords
        if (!match.matchingWords?.length) {
          const placeholder = document.createElement("span");
          placeholder.className = "chip chip-match";
          placeholder.textContent = "Upload resume to see matches";
          placeholder.style.opacity = "0.5";
          mat.appendChild(placeholder);
        }
        
        // Missing keywords
        mis.innerHTML = "";
        (match.missingWords || []).slice(0, 20).forEach((w) => {
          const chip = document.createElement("span");
          chip.className = "chip chip-missing";
          chip.textContent = w;
          mis.appendChild(chip);
        });
        
        // Show placeholder if no missing keywords
        if (!match.missingWords?.length) {
          const placeholder = document.createElement("span");
          placeholder.className = "chip chip-missing";
          placeholder.textContent = "Great match!";
          placeholder.style.opacity = "0.5";
          mis.appendChild(placeholder);
        }
      };
      
      try {
        chrome.storage.session.get("applyease_last_match", (d) => {
          const cached = d?.applyease_last_match || null;
          if (cached) return render(cached);
          chrome.tabs.sendMessage(
            tabs[0].id,
            { action: "computeMatch", token },
            (res) => {
              if (res && res.ok && res.match) render(res.match);
            }
          );
        });
      } catch (e) {
        console.error("ApplyEase popup: Error getting match", e);
      }
    });
  };

  // Inject content script if not already loaded
  const ensureContentScript = (tabId) => {
    return new Promise((resolve) => {
      console.log("ApplyEase popup: Checking content script on tab", tabId);
      
      chrome.tabs.sendMessage(tabId, { action: "ping" }, (response) => {
        if (chrome.runtime.lastError) {
          console.log("ApplyEase popup: Injecting content script...");
        }
        
        if (!response || chrome.runtime.lastError) {
          chrome.scripting.executeScript({
            target: { tabId: tabId, allFrames: true },
            files: ["contentscript.js"]
          }, (results) => {
            if (chrome.runtime.lastError) {
              console.error("ApplyEase popup: Injection failed:", chrome.runtime.lastError.message);
            } else {
              console.log("ApplyEase popup: Content script injected");
            }
            setTimeout(resolve, 800);
          });
        } else {
          console.log("ApplyEase popup: Content script ready");
          resolve();
        }
      });
    });
  };

  const showLoading = (show, text = "Filling your application...") => {
    const loading = document.getElementById("loading");
    const fillingText = document.getElementById("filling-text");
    if (show) {
      loading.classList.add("visible");
      fillingText.textContent = text;
    } else {
      loading.classList.remove("visible");
    }
  };

  const initWithToken = (token) => {
    const autoFillBtn = document.getElementById("auto-fill");
    const trackerBtn = document.getElementById("open-tracker");
    
    if (token) {
      console.log("ApplyEase popup: Authenticated");
      
      autoFillBtn.addEventListener("click", async () => {
        console.log("ApplyEase popup: Auto Fill clicked");
        showLoading(true);
        
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
          if (!tabs[0]) {
            showLoading(false);
            return;
          }
          
          await ensureContentScript(tabs[0].id);
          
          chrome.tabs.sendMessage(
            tabs[0].id,
            { action: "fillInputFields", data: token },
            (response) => {
              console.log("ApplyEase popup: Fill response:", response);
              if (chrome.runtime.lastError) {
                console.error("ApplyEase popup: Error:", chrome.runtime.lastError.message);
              }
              showLoading(false);
              
              // Show success briefly
              const btn = document.getElementById("auto-fill");
              const originalHTML = btn.innerHTML;
              btn.innerHTML = '<span>✓</span><span>Done!</span>';
              btn.style.background = 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)';
              
              setTimeout(() => {
                btn.innerHTML = originalHTML;
                btn.style.background = '';
              }, 2000);
            }
          );
          
          renderMatch(token);
        });
      });
      
      trackerBtn.addEventListener("click", () => {
        chrome.tabs.create({ url: "http://localhost:3000/job-tracker" });
      });
      
      // Render match immediately
      renderMatch(token);
      
    } else {
      console.log("ApplyEase popup: Not authenticated");
      
      // Update UI for logged out state
      autoFillBtn.innerHTML = '<span>🔑</span><span>Login to Start</span>';
      autoFillBtn.addEventListener("click", () => {
        chrome.tabs.create({ url: "http://localhost:3000/login" });
      });
      
      trackerBtn.addEventListener("click", () => {
        chrome.tabs.create({ url: "http://localhost:3000/login" });
      });
    }
  };

  // Get token and initialize
  chrome.runtime.sendMessage({ action: "fetchToken" }, (token) => {
    if (token) return initWithToken(token);
    
    // Fallback: ask content script to sync from page localStorage
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0]) return initWithToken(null);
      chrome.tabs.sendMessage(tabs[0].id, { action: "getOrSyncToken" }, (resp) => {
        initWithToken(resp?.token || null);
      });
    });
  });
});
