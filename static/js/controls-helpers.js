/* ═══════════════════════════════════════════════════════════════
   PHASE 3: CONTROLS & BUTTONS - JavaScript Helpers
   Functions for animations, loading states, and interactions
   ═══════════════════════════════════════════════════════════════ */

// ┌──────────────────────────────────────────────────────────────┐
// │ AI LOADING OVERLAY                                           │
// └──────────────────────────────────────────────────────────────┘

function showAILoading(message = 'AI IS THINKING...', action = 'Analyzing battlefield...') {
    const overlay = document.getElementById('ai-loading-overlay');
    const messageEl = document.getElementById('ai-loading-message');
    const actionEl = document.getElementById('ai-action-text');
    
    if (overlay) {
        if (messageEl) messageEl.textContent = message;
        if (actionEl) actionEl.textContent = action;
        overlay.classList.remove('hidden');
    }
}

function hideAILoading() {
    const overlay = document.getElementById('ai-loading-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}

function updateAILoadingAction(action) {
    const actionEl = document.getElementById('ai-action-text');
    if (actionEl) {
        actionEl.textContent = action;
    }
}

// ┌──────────────────────────────────────────────────────────────┐
// │ BUTTON RIPPLE EFFECT                                         │
// └──────────────────────────────────────────────────────────────┘

function createButtonRipple(event) {
    const button = event.currentTarget;
    const ripple = document.createElement('span');
    
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;
    
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    ripple.classList.add('button-ripple');
    
    button.appendChild(ripple);
    
    setTimeout(() => {
        ripple.remove();
    }, 600);
}

// Add ripple effect to all game buttons
function initializeButtonRipples() {
    const buttons = document.querySelectorAll('.game-button');
    buttons.forEach(button => {
        button.addEventListener('click', createButtonRipple);
    });
}

// ┌──────────────────────────────────────────────────────────────┐
// │ PHASE TRANSITION ANIMATIONS                                  │
// └──────────────────────────────────────────────────────────────┘

function createPhaseTransition() {
    // Flash effect
    const flash = document.createElement('div');
    flash.classList.add('phase-transition-flash');
    document.body.appendChild(flash);
    
    setTimeout(() => {
        flash.remove();
    }, 600);
    
    // Ripple effect
    const ripple = document.createElement('div');
    ripple.classList.add('phase-ripple');
    document.body.appendChild(ripple);
    
    setTimeout(() => {
        ripple.remove();
    }, 800);
}

// ┌──────────────────────────────────────────────────────────────┐
// │ GLASS MORPHISM MODAL HELPERS                                 │
// └──────────────────────────────────────────────────────────────┘

function createModal(title, titleIcon, content, buttons, onClose) {
    // Create backdrop
    const backdrop = document.createElement('div');
    backdrop.classList.add('modal-backdrop');
    
    // Create modal
    const modal = document.createElement('div');
    modal.classList.add('modal-glass');
    
    // Create header
    const header = document.createElement('div');
    header.classList.add('modal-header');
    
    const titleEl = document.createElement('div');
    titleEl.classList.add('modal-title');
    if (titleIcon) {
        const iconSpan = document.createElement('span');
        iconSpan.classList.add('modal-title-icon');
        iconSpan.textContent = titleIcon;
        titleEl.appendChild(iconSpan);
    }
    const titleText = document.createElement('span');
    titleText.textContent = title;
    titleEl.appendChild(titleText);
    
    const closeBtn = document.createElement('button');
    closeBtn.classList.add('modal-close');
    closeBtn.textContent = '×';
    closeBtn.onclick = () => {
        closeModal(backdrop);
        if (onClose) onClose();
    };
    
    header.appendChild(titleEl);
    header.appendChild(closeBtn);
    
    // Create body
    const body = document.createElement('div');
    body.classList.add('modal-body');
    
    if (typeof content === 'string') {
        const textEl = document.createElement('div');
        textEl.classList.add('modal-text');
        textEl.textContent = content;
        body.appendChild(textEl);
    } else {
        body.appendChild(content);
    }
    
    // Create footer with buttons
    const footer = document.createElement('div');
    footer.classList.add('modal-footer');
    
    if (buttons && buttons.length > 0) {
        buttons.forEach(btn => {
            const button = document.createElement('button');
            button.classList.add('game-button');
            
            // Add button type class
            if (btn.type === 'primary') {
                button.classList.add('game-button-primary');
            } else if (btn.type === 'secondary') {
                button.classList.add('game-button-secondary');
            } else if (btn.type === 'danger') {
                button.classList.add('game-button-danger');
            }
            
            // Add icon if provided
            if (btn.icon) {
                const iconSpan = document.createElement('span');
                iconSpan.classList.add('game-button-icon');
                iconSpan.textContent = btn.icon;
                button.appendChild(iconSpan);
            }
            
            // Add text
            const textSpan = document.createElement('span');
            textSpan.textContent = btn.text;
            button.appendChild(textSpan);
            
            // Add click handler
            button.onclick = () => {
                if (btn.onClick) btn.onClick();
                if (btn.closeModal !== false) {
                    closeModal(backdrop);
                }
            };
            
            footer.appendChild(button);
        });
    }
    
    // Assemble modal
    modal.appendChild(header);
    modal.appendChild(body);
    if (buttons && buttons.length > 0) {
        modal.appendChild(footer);
    }
    
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    
    // Click backdrop to close
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
            closeModal(backdrop);
            if (onClose) onClose();
        }
    });
    
    return backdrop;
}

function closeModal(backdrop) {
    if (backdrop) {
        backdrop.classList.add('fade-out');
        setTimeout(() => {
            backdrop.remove();
        }, 300);
    }
}

// ┌──────────────────────────────────────────────────────────────┐
// │ INITIALIZE CONTROLS SYSTEM                                   │
// └──────────────────────────────────────────────────────────────┘

function initializeControls() {
    // Initialize button ripples
    initializeButtonRipples();
    
    // Log initialization
    console.log('✅ Phase 3 Controls & Buttons initialized');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeControls);
} else {
    initializeControls();
}
