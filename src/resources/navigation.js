document.addEventListener('DOMContentLoaded', function() {
    (function() {
        const vscode = acquireVsCodeApi();
        document.getElementById('previous-technique').addEventListener('click', function () {
            vscode.postMessage({ command: 'previous' });
        });
        document.getElementById('next-technique').addEventListener('click', function () {
            vscode.postMessage({ command: 'next' });
        });
    }());
});
