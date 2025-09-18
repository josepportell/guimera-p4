# Guía d'Integració de l'Assistent IA Guimerà a WordPress

## Visió General

Aquest document explica com integrar l'assistent IA de Guimerà al teu lloc web WordPress existent. Hi ha diferents opcions segons les teves necessitats tècniques i preferències.

---

## Opció 1: Integració per iFrame (Més Fàcil)

### Avantatges
- ✅ Implementació ràpida i senzilla
- ✅ No cal modificar el codi existent
- ✅ Actualitzacions automàtiques
- ✅ Compatible amb qualsevol tema de WordPress

### Desavantatges
- ❌ Menys control sobre l'estil
- ❌ Pot tenir problemes de responsivitat
- ❌ Limitacions de comunicació entre pàgines

### Implementació

#### Pas 1: Afegir el codi HTML
Afegeix aquest codi a la pàgina o entrada on vols mostrar l'assistent:

```html
<div id="guimera-ai-container" style="width: 100%; height: 600px; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
    <iframe
        src="https://guimera-ai-frontend.onrender.com"
        width="100%"
        height="100%"
        frameborder="0"
        title="Assistent IA Guimerà"
        allow="microphone; camera"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups">
    </iframe>
</div>
```

#### Pas 2: Opcions d'implementació a WordPress

**Mètode A: Editor de Blocs (Gutenberg)**
1. Edita la pàgina on vols afegir l'assistent
2. Afegeix un bloc "HTML personalitzat"
3. Enganxa el codi de l'iframe
4. Desa la pàgina

**Mètode B: Editor Clàssic**
1. Edita la pàgina en mode "Text" (no Visual)
2. Enganxa el codi de l'iframe
3. Desa la pàgina

**Mètode C: Shortcode personalitzat**
Afegeix aquest codi al `functions.php` del teu tema:

```php
function guimera_ai_shortcode($atts) {
    $atts = shortcode_atts([
        'height' => '600px',
        'width' => '100%'
    ], $atts);

    return '<div id="guimera-ai-container" style="width: ' . esc_attr($atts['width']) . '; height: ' . esc_attr($atts['height']) . '; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
        <iframe
            src="https://guimera-ai-frontend.onrender.com"
            width="100%"
            height="100%"
            frameborder="0"
            title="Assistent IA Guimerà"
            allow="microphone; camera"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups">
        </iframe>
    </div>';
}
add_shortcode('guimera_ai', 'guimera_ai_shortcode');
```

Després pots usar `[guimera_ai]` o `[guimera_ai height="800px"]` a qualsevol pàgina.

---

## Opció 2: Integració Nativa (Avançada)

### Avantatges
- ✅ Control total sobre l'estil i aparença
- ✅ Integració perfecta amb el tema
- ✅ Millor experiència d'usuari
- ✅ Optimització SEO

### Desavantatges
- ❌ Requereix coneixements tècnics
- ❌ Més temps d'implementació
- ❌ Cal gestionar actualitzacions manualment

### Implementació

#### Pas 1: Preparar els fitxers
1. Descarrega els fitxers de producció del frontend:
   - `dist/index.html`
   - `dist/assets/` (tots els fitxers CSS i JS)

#### Pas 2: Crear un plugin personalitzat

Crea un nou fitxer `wp-content/plugins/guimera-ai/guimera-ai.php`:

```php
<?php
/**
 * Plugin Name: Assistent IA Guimerà
 * Description: Integra l'assistent IA de Guimerà al teu lloc WordPress
 * Version: 1.0
 * Author: Guimerà
 */

// Prevenir accés directe
if (!defined('ABSPATH')) {
    exit;
}

class GuimeraAI {

    public function __construct() {
        add_action('wp_enqueue_scripts', [$this, 'enqueue_scripts']);
        add_shortcode('guimera_ai_native', [$this, 'render_ai_interface']);
        add_action('wp_ajax_guimera_ai_query', [$this, 'handle_ai_query']);
        add_action('wp_ajax_nopriv_guimera_ai_query', [$this, 'handle_ai_query']);
    }

    public function enqueue_scripts() {
        // Carregar els CSS i JS del frontend
        wp_enqueue_style(
            'guimera-ai-style',
            plugin_dir_url(__FILE__) . 'assets/index.css',
            [],
            '1.0'
        );

        wp_enqueue_script(
            'guimera-ai-script',
            plugin_dir_url(__FILE__) . 'assets/index.js',
            [],
            '1.0',
            true
        );

        // Passar la URL de l'API a JavaScript
        wp_localize_script('guimera-ai-script', 'guimera_ai_ajax', [
            'ajax_url' => admin_url('admin-ajax.php'),
            'api_url' => 'https://guimera-ai-backend.onrender.com',
            'nonce' => wp_create_nonce('guimera_ai_nonce')
        ]);
    }

    public function render_ai_interface($atts) {
        $atts = shortcode_atts([
            'style' => 'default'
        ], $atts);

        ob_start();
        ?>
        <div id="guimera-ai-root" class="guimera-ai-container" data-style="<?php echo esc_attr($atts['style']); ?>">
            <div class="guimera-ai-loading">
                <p>Carregant l'assistent IA de Guimerà...</p>
            </div>
        </div>

        <style>
        .guimera-ai-container {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            border: 1px solid #e1e5e9;
            border-radius: 8px;
            background: #fff;
        }

        .guimera-ai-loading {
            text-align: center;
            padding: 40px;
            color: #666;
        }

        /* Integració amb temes populars de WordPress */
        .wp-block-group .guimera-ai-container,
        .entry-content .guimera-ai-container {
            border: none;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        </style>

        <script>
        document.addEventListener('DOMContentLoaded', function() {
            // Inicialitzar l'aplicació React aquí
            if (window.GuimeraAI && window.GuimeraAI.init) {
                window.GuimeraAI.init('guimera-ai-root', {
                    apiUrl: guimera_ai_ajax.api_url,
                    theme: 'wordpress-integration'
                });
            }
        });
        </script>
        <?php
        return ob_get_clean();
    }

    public function handle_ai_query() {
        // Verificar nonce
        if (!wp_verify_nonce($_POST['nonce'], 'guimera_ai_nonce')) {
            wp_die('Seguretat: Accés denegat');
        }

        $query = sanitize_text_field($_POST['query']);

        // Fer la crida a l'API del backend
        $response = wp_remote_post('https://guimera-ai-backend.onrender.com/api/query', [
            'headers' => ['Content-Type' => 'application/json'],
            'body' => json_encode(['query' => $query]),
            'timeout' => 30
        ]);

        if (is_wp_error($response)) {
            wp_send_json_error('Error de connexió amb l\'API');
        }

        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);

        wp_send_json_success($data);
    }
}

// Inicialitzar el plugin
new GuimeraAI();
```

#### Pas 3: Copiar els fitxers estàtics
1. Crea la carpeta `wp-content/plugins/guimera-ai/assets/`
2. Copia tots els fitxers de `dist/assets/` a aquesta carpeta

#### Pas 4: Activar i usar
1. Activa el plugin des del panell d'administració
2. Usa el shortcode `[guimera_ai_native]` a qualsevol pàgina

---

## Opció 3: Widget Flotant (Recomanada)

### Avantatges
- ✅ Accessible des de totes les pàgines
- ✅ No interromp el contingut existent
- ✅ Experiència d'usuari moderna
- ✅ Fàcil d'implementar

### Implementació

Afegeix aquest codi al `functions.php` del teu tema:

```php
function guimera_ai_floating_widget() {
    ?>
    <div id="guimera-ai-widget" style="position: fixed; bottom: 20px; right: 20px; z-index: 9999;">
        <button id="guimera-ai-toggle" style="
            background: #2c5530;
            color: white;
            border: none;
            border-radius: 50%;
            width: 60px;
            height: 60px;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            font-size: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
        ">
            💬
        </button>

        <div id="guimera-ai-panel" style="
            position: absolute;
            bottom: 70px;
            right: 0;
            width: 350px;
            height: 500px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.2);
            display: none;
            overflow: hidden;
        ">
            <iframe
                src="https://guimera-ai-frontend.onrender.com"
                width="100%"
                height="100%"
                frameborder="0"
                title="Assistent IA Guimerà">
            </iframe>
        </div>
    </div>

    <script>
    document.addEventListener('DOMContentLoaded', function() {
        const toggle = document.getElementById('guimera-ai-toggle');
        const panel = document.getElementById('guimera-ai-panel');
        let isOpen = false;

        toggle.addEventListener('click', function() {
            isOpen = !isOpen;
            panel.style.display = isOpen ? 'block' : 'none';
            toggle.innerHTML = isOpen ? '✕' : '💬';
        });

        // Tancar si es clica fora
        document.addEventListener('click', function(e) {
            if (!document.getElementById('guimera-ai-widget').contains(e.target)) {
                isOpen = false;
                panel.style.display = 'none';
                toggle.innerHTML = '💬';
            }
        });
    });
    </script>
    <?php
}
add_action('wp_footer', 'guimera_ai_floating_widget');
```

---

## Configuració de Seguretat

### CORS (Cross-Origin Resource Sharing)
Si uses la integració nativa, pot caldre configurar CORS al backend. Afegeix aquestes capçaleres:

```javascript
// Al teu backend Express.js
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'https://tudomini.com');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    next();
});
```

### Content Security Policy (CSP)
Si el teu WordPress té CSP activat, afegeix:

```
frame-src https://guimera-ai-frontend.onrender.com;
connect-src https://guimera-ai-backend.onrender.com;
```

---

## Personalització de l'Estil

### CSS personalitzat per iFrame
```css
#guimera-ai-container {
    border: 2px solid #2c5530;
    border-radius: 12px;
    box-shadow: 0 4px 16px rgba(44, 85, 48, 0.1);
    margin: 20px 0;
}

/* Responsive */
@media (max-width: 768px) {
    #guimera-ai-container {
        height: 400px;
    }
}
```

### Integració amb temes populars

**Twenty Twenty-Three**
```css
.wp-block-group .guimera-ai-container {
    background: var(--wp--preset--color--base);
    border-color: var(--wp--preset--color--contrast);
}
```

**Astra**
```css
.ast-container .guimera-ai-container {
    border-radius: var(--ast-border-radius);
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}
```

---

## Optimització i Rendiment

### Carregar només quan cal
```php
function guimera_ai_conditional_load() {
    // Només carregar a pàgines específiques
    if (is_page(['contacte', 'about', 'serveis'])) {
        // Carregar els scripts
    }
}
add_action('wp_enqueue_scripts', 'guimera_ai_conditional_load');
```

### Lazy loading
```javascript
// Carregar l'iframe només quan és visible
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const iframe = entry.target.querySelector('iframe');
            if (!iframe.src) {
                iframe.src = 'https://guimera-ai-frontend.onrender.com';
            }
        }
    });
});

observer.observe(document.getElementById('guimera-ai-container'));
```

---

## Resolució de Problemes

### Problemes comuns

**1. L'iframe no carrega**
- Verifica que l'URL sigui correcta
- Comprova la consola del navegador per errors
- Assegura't que no hi ha bloqueigs de CSP

**2. Problemes de responsivitat**
- Afegeix CSS responsive
- Considera usar `aspect-ratio` en CSS

**3. Conflictes amb plugins**
- Desactiva altres plugins de chat temporalment
- Verifica conflictes de JavaScript a la consola

### Debug
Afegeix això al `wp-config.php` per veure errors:
```php
define('WP_DEBUG', true);
define('WP_DEBUG_LOG', true);
```

---

## Manteniment i Actualitzacions

### Actualizacions automàtiques (iFrame)
L'opció d'iFrame s'actualitza automàticament quan actualitzes el deployment de Render.

### Actualitzacions manuals (Integració nativa)
1. Torna a construir el frontend amb `npm run build`
2. Substitueix els fitxers a `wp-content/plugins/guimera-ai/assets/`
3. Neteja la caché de WordPress

---

## Recomanacions Finals

1. **Per a la majoria d'usuaris**: Usa l'**Opció 3 (Widget Flotant)** - és fàcil d'implementar i proporciona una bona experiència d'usuari.

2. **Per a integració senzilla**: Usa l'**Opció 1 (iFrame)** en una pàgina dedicada.

3. **Per a control total**: Usa l'**Opció 2 (Integració Nativa)** si tens coneixements tècnics.

### Consideracions de rendiment
- L'iFrame carrega una aplicació React completa
- Considera implementar lazy loading
- Monitora l'impacte en la velocitat de la pàgina

### Suport
Per a suport tècnic o personalitzacions avançades, contacta amb l'equip de desenvolupament de Guimerà.