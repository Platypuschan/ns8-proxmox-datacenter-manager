*** Settings ***
Library    SSHLibrary
Library    String
Resource    api.resource

*** Variables ***
${IMAGE_URL}         ghcr.io/platypuschan/proxmox-datacenter-manager:latest
# The update scenario starts from the last published stable release of this
# module; test-module-update.sh looks it up in the registry.
${PREVIOUS_IMAGE_URL}    ${EMPTY}
${SCENARIO}          install
${HOST}              pdm.test
${module_id}         ${EMPTY}
${web_port}          ${EMPTY}
${ADMIN_USER}        admin
${ADMIN_PASSWORD}    Nethesis,1234
${PDM_PASSWORD}      ci-first-Password-1
${PDM_PASSWORD_2}    ci-second-Password-2
${clone_id}          ${EMPTY}
${backup_id}         ${EMPTY}
${repository}        ${EMPTY}
${repository_created}    ${FALSE}

*** Keywords ***
Login to cluster-admin
    New Page    https://${NODE_ADDR}/cluster-admin/
    Fill Text    text="Username"    ${ADMIN_USER}
    Click    button >> text="Continue"
    Fill Text    text="Password"    ${ADMIN_PASSWORD}
    Click    button >> text="Log in"
    Wait For Elements State    css=#main-content    visible    timeout=10s

Read allocated web port
    ${port} =    Execute Command    runagent -m ${module_id} printenv TCP_PORT
    ${port} =    Strip String    ${port}
    Should Match Regexp    ${port}    ^[0-9]+$
    Set Suite Variable    ${web_port}    ${port}

PDM answers on its loopback port
    ${output}    ${rc} =    Execute Command    curl -ksS --max-time 5 -o /dev/null -w '\%{http_code}' https://127.0.0.1:${web_port}/
    ...    return_rc=True
    Should Be Equal As Integers    ${rc}    0
    Should Be Equal    ${output}    200

Wait until PDM is up
    Wait Until Keyword Succeeds    180 seconds    3 seconds    PDM answers on its loopback port

Login status
    [Arguments]    ${password}    ${base}=https://127.0.0.1:${web_port}    ${extra}=
    ${payload} =    Evaluate    json.dumps({"username": "root@pam", "password": $password})    modules=json
    ${output}    ${rc} =    Execute Command    curl -ksS --max-time 10 ${extra} -o /dev/null -w '\%{http_code}' -H 'Content-Type: application/json' -d '${payload}' ${base}/api2/json/access/ticket
    ...    return_rc=True
    Should Be Equal As Integers    ${rc}    0
    RETURN    ${output}

Configure module
    [Arguments]    ${password}
    ${options} =    Create Dictionary    tls_import=${TRUE}    disable_nag=${TRUE}    ns8_layout=${TRUE}    debian_extra=${TRUE}    repo_test=${TRUE}
    ...    hide_menu=${{["subscription", "registry", "sdn", "ceph"]}}
    ${payload} =    Evaluate    json.dumps({"host": $HOST, "http2https": False, "lets_encrypt": False, "admin_password": $password, "options": $options})    modules=json
    ${output}    ${rc} =    Execute Command    api-cli run module/${module_id}/configure-module --data '${payload}'
    ...    return_rc=True
    Should Be Equal As Integers    ${rc}    0    configure-module failed: ${output}

PDM client
    [Documentation]    Run tests/pdm_client.py on the node: BASE is the PDM URL, HOST an optional Host header.
    [Arguments]    ${password}    ${base}    ${command}    @{args}    ${host}=${EMPTY}
    ${hostopt} =    Set Variable If    '${host}' != ''    --host ${host}    ${EMPTY}
    ${output}    ${error}    ${rc} =    Execute Command    PDM_PASSWORD='${password}' python3 -I /tmp/pdm_client.py ${hostopt} ${base} ${command}
    ...    return_stderr=True    return_rc=True
    Should Be Equal As Integers    ${rc}    0    pdm_client ${command} ${base} failed: ${output} ${error}
    RETURN    ${output}

PDM api
    [Documentation]    Authenticated API call with curl (tests/pdm_api.sh). Extra arguments are key=value pairs.
    [Arguments]    ${password}    ${base}    ${method}    ${path}    @{pairs}    ${host}=${EMPTY}
    ${quoted} =    Evaluate    ' '.join(shlex.quote(p) for p in $pairs)    modules=shlex
    ${output}    ${error}    ${rc} =    Execute Command    PDM_HOST='${host}' PDM_PASSWORD='${password}' bash /tmp/pdm_api.sh ${base} ${method} ${path} ${quoted}
    ...    return_stderr=True    return_rc=True
    Should Be Equal As Integers    ${rc}    0    ${method} ${path} on ${base} failed: ${output} ${error}
    RETURN    ${output}

Module environment
    [Arguments]    ${id}    ${name}
    ${out} =    Execute Command    runagent -m ${id} printenv ${name}
    RETURN    ${out.strip()}

Loopback URL of
    [Arguments]    ${id}
    ${port} =    Module environment    ${id}    TCP_PORT
    RETURN    https://127.0.0.1:${port}

Served certificate is the Traefik certificate
    ${expected} =    Execute Command    runagent -m ${module_id} openssl x509 -in tls-certs/cert.pem -noout -fingerprint -sha256
    ${served} =    Execute Command    echo | openssl s_client -connect 127.0.0.1:${web_port} 2>/dev/null | openssl x509 -noout -fingerprint -sha256
    Should Contain    ${expected}    Fingerprint=
    Should Be Equal    ${served}    ${expected}

Served certificate has fingerprint
    [Arguments]    ${expected}
    ${served} =    Execute Command    echo | openssl s_client -connect 127.0.0.1:${web_port} 2>/dev/null | openssl x509 -noout -fingerprint -sha256
    Should Be Equal    ${served.strip()}    ${expected}

Module answers
    [Arguments]    ${base}
    ${out}    ${rc} =    Execute Command    curl -ksSf --max-time 5 -o /dev/null ${base}/    return_rc=True
    Should Be Equal As Integers    ${rc}    0    ${out}

Wait until module is up
    [Arguments]    ${id}
    ${base} =    Loopback URL of    ${id}
    Wait Until Keyword Succeeds    180 seconds    3 seconds    Module answers    ${base}

Marker user exists
    [Arguments]    ${password}    ${base}    ${host}=${EMPTY}
    ${users} =    PDM api    ${password}    ${base}    GET    /api2/json/access/users    host=${host}
    Should Contain    ${users}    ci-marker@pdm

*** Test Cases ***
Add module for ${SCENARIO} scenario
    IF    r'${SCENARIO}' == 'update'
        Set Local Variable    ${install_image}    ${PREVIOUS_IMAGE_URL}
    ELSE
        Set Local Variable    ${install_image}    ${IMAGE_URL}
    END
    ${output}    ${rc} =    Execute Command    add-module ${install_image} 1
    ...    return_rc=True
    Should Be Equal As Integers    ${rc}    0    add-module ${install_image} failed: ${output}
    &{output} =    Evaluate    ast.literal_eval(r"""${output}""")    modules=ast
    Set Suite Variable    ${module_id}    ${output.module_id}

First configuration needs an administrator password
    ${payload} =    Evaluate    json.dumps({"host": $HOST, "http2https": False, "lets_encrypt": False})    modules=json
    ${output}    ${rc} =    Execute Command    api-cli run module/${module_id}/configure-module --data '${payload}'
    ...    return_rc=True
    Should Not Be Equal As Integers    ${rc}    0
    ${payload} =    Evaluate    json.dumps({"host": $HOST, "http2https": False, "lets_encrypt": False, "admin_password": "short"})    modules=json
    ${output}    ${rc} =    Execute Command    api-cli run module/${module_id}/configure-module --data '${payload}'
    ...    return_rc=True
    Should Not Be Equal As Integers    ${rc}    0

Configure initial module
    Configure module    ${PDM_PASSWORD}
    Read allocated web port
    Wait until PDM is up

Install the test client
    Put File    tests/pdm_client.py    /tmp/pdm_client.py
    Put File    tests/pdm_api.sh    /tmp/pdm_api.sh

Diagnose API access paths
    [Documentation]    Logs how the same call behaves directly and through Traefik; never fails.
    Put File    tests/diagnose.sh    /tmp/diagnose.sh
    ${out} =    Execute Command    PDM_PASSWORD='${PDM_PASSWORD}' bash /tmp/diagnose.sh ${web_port} ${HOST}
    Log    ${out}    console=${True}

Create marker data
    # A user in the PDM configuration and a task in the task history must survive
    # update, restore and clone.
    ${base} =    Loopback URL of    ${module_id}
    ${out} =    PDM api    ${PDM_PASSWORD}    ${base}    POST    /api2/json/access/users    userid=ci-marker@pdm    comment=ci-marker
    Marker user exists    ${PDM_PASSWORD}    ${base}

Update module from the previous release
    Skip If    r'${SCENARIO}' != 'update'    only the update scenario updates the module
    Log    Scenario ${SCENARIO} with ${IMAGE_URL}    console=${True}
    ${output}    ${rc} =    Execute Command    api-cli run update-module --data '{"module_url":"${IMAGE_URL}","instances":["${module_id}"]}'
    ...    return_rc=True
    Should Be Equal As Integers    ${rc}    0    update-module ${IMAGE_URL} failed: ${output}
    ${journal} =    Execute Command    journalctl -q --no-pager SYSLOG_IDENTIFIER=agent@${module_id}
    Should Not Contain    ${journal}    has failed    an update-module.d step failed
    Wait until PDM is up

Administrator login works and a wrong password is refused
    ${code} =    Login status    ${PDM_PASSWORD}
    Should Be Equal    ${code}    200
    ${code} =    Login status    not-the-password
    Should Be Equal    ${code}    401

Password is stored only as a hash
    ${mode} =    Execute Command    runagent -m ${module_id} stat -c '%a' admin.env
    ${mode} =    Strip String    ${mode}
    Should Be Equal    ${mode}    600
    ${content} =    Execute Command    runagent -m ${module_id} cat admin.env
    Should Contain    ${content}    PASSWORD_HASH=$6$
    Should Not Contain    ${content}    ${PDM_PASSWORD}
    ${output}    ${rc} =    Execute Command    api-cli run module/${module_id}/get-configuration
    ...    return_rc=True
    Should Be Equal As Integers    ${rc}    0
    Should Match Regexp    ${output}    "admin_password_set":\\s*true
    Should Not Contain    ${output}    ${PDM_PASSWORD}
    Should Not Contain    ${output}    $6$

Check the application image
    ${version} =    Execute Command    runagent -m ${module_id} podman exec pdm cat /etc/pdm-version
    ${version} =    Strip String    ${version}
    Should Match Regexp    ${version}    ^[0-9]+[.][0-9]+[.][0-9]+$
    ${image} =    Execute Command    runagent -m ${module_id} printenv PDM_APP_IMAGE
    Should Contain    ${image}    /pdm-app:
    ${postfix} =    Execute Command    runagent -m ${module_id} podman exec pdm sh -c 'command -v postfix || echo none'
    Should Contain    ${postfix}    none

Check the container is rootless and bound to loopback
    ${bind} =    Execute Command    runagent -m ${module_id} podman port pdm
    Should Contain    ${bind}    127.0.0.1:${web_port}
    ${mounts} =    Execute Command    runagent -m ${module_id} podman inspect pdm --format '{{range .Mounts}}{{.Destination}} {{end}}'
    Should Contain    ${mounts}    /etc/proxmox-datacenter-manager
    Should Contain    ${mounts}    /var/lib/proxmox-datacenter-manager

Check the route through Traefik
    ${code} =    Login status    ${PDM_PASSWORD}    http://${HOST}    --resolve ${HOST}:80:127.0.0.1
    Should Be Equal    ${code}    200
    ${output}    ${rc} =    Execute Command    curl -ksS --max-time 10 --resolve ${HOST}:80:127.0.0.1 http://${HOST}/
    ...    return_rc=True
    Should Be Equal As Integers    ${rc}    0
    Should Contain    ${output}    Proxmox Datacenter Manager

Node shell works over a websocket through the Traefik route
    ${out} =    PDM client    ${PDM_PASSWORD}    http://127.0.0.1    shell    host=${HOST}
    Should Contain    ${out}    101 Switching Protocols
    Should Contain    ${out}    ws-ok

Marker data is present after install or update
    ${base} =    Loopback URL of    ${module_id}
    Marker user exists    ${PDM_PASSWORD}    ${base}

Keep the password when configuring without one
    Configure module    ${EMPTY}
    Wait until PDM is up
    ${code} =    Login status    ${PDM_PASSWORD}
    Should Be Equal    ${code}    200

Change the password
    Configure module    ${PDM_PASSWORD_2}
    Wait until PDM is up
    ${code} =    Login status    ${PDM_PASSWORD_2}
    Should Be Equal    ${code}    200
    ${code} =    Login status    ${PDM_PASSWORD}
    Should Be Equal    ${code}    401

Data survives a service restart
    ${rc} =    Execute Command    runagent -m ${module_id} sh -c 'systemctl --user restart pdm.service'
    ...    return_rc=True    return_stdout=False
    Should Be Equal As Integers    ${rc}    0
    Wait until PDM is up
    ${code} =    Login status    ${PDM_PASSWORD_2}
    Should Be Equal    ${code}    200
    ${volumes} =    Execute Command    runagent -m ${module_id} podman volume ls --format '{{.Name}}'
    Should Contain    ${volumes}    pdm-config
    Should Contain    ${volumes}    pdm-data
    Should Contain    ${volumes}    pdm-log

Options are fixed after the first configuration
    ${output} =    Execute Command    api-cli run module/${module_id}/get-configuration
    ${config} =    Evaluate    json.loads(r"""${output}""")    modules=json
    Should Be True    ${config}[options_locked]
    Should Be True    ${config}[options][ns8_layout]
    Should Be Equal    ${config}[options][hide_menu]    ${{["subscription", "registry", "sdn", "ceph"]}}
    # a second configuration with other values must not change them
    ${payload} =    Evaluate    json.dumps({"host": $HOST, "http2https": False, "lets_encrypt": False, "options": {"ns8_layout": False, "hide_menu": []}})    modules=json
    ${output}    ${rc} =    Execute Command    api-cli run module/${module_id}/configure-module --data '${payload}'
    ...    return_rc=True
    Should Be Equal As Integers    ${rc}    0    configure-module failed: ${output}
    Wait until PDM is up
    ${output} =    Execute Command    api-cli run module/${module_id}/get-configuration
    ${config} =    Evaluate    json.loads(r"""${output}""")    modules=json
    Should Be True    ${config}[options][ns8_layout]
    Should Be Equal    ${config}[options][hide_menu]    ${{["subscription", "registry", "sdn", "ceph"]}}

The web interface serves the adjustments
    ${out} =    Execute Command    curl -ksS --max-time 10 https://127.0.0.1:${web_port}/js/ns8-config.js
    Should Contain    ${out}    layout: true
    Should Contain    ${out}    "subscription","registry","sdn","ceph"
    ${out} =    Execute Command    curl -ksS --max-time 10 https://127.0.0.1:${web_port}/ | grep -c ns8-custom.js
    Should Be Equal As Integers    ${out}    1

PDM serves the Traefik certificate
    Wait Until Keyword Succeeds    120 seconds    3 seconds    Served certificate is the Traefik certificate

DNS search domain can be changed in PDM
    ${base} =    Loopback URL of    ${module_id}
    ${out} =    PDM api    ${PDM_PASSWORD_2}    ${base}    PUT    /api2/json/nodes/localhost/dns    search=ci.example    dns1=9.9.9.9
    Should Not Contain    ${out}    Atomic rename
    ${out} =    PDM api    ${PDM_PASSWORD_2}    ${base}    GET    /api2/json/nodes/localhost/dns
    Should Contain    ${out}    ci.example

All packages are correctly installed
    ${base} =    Loopback URL of    ${module_id}
    ${out} =    PDM api    ${PDM_PASSWORD_2}    ${base}    GET    /api2/json/nodes/localhost/apt/versions
    ${versions} =    Evaluate    {p["Package"]: p.get("OldVersion") for p in json.loads($out)["data"]}    modules=json
    FOR    ${package}    IN    proxmox-datacenter-manager-meta    proxmox-datacenter-manager    ifupdown2    proxmox-mail-forward    proxmox-offline-mirror-helper    zfsutils-linux
        Should Not Be Empty    ${versions}[${package}]    ${package} is not installed
    END

A renewed Traefik certificate reaches PDM
    [Documentation]    Uploads a new custom certificate for the host name to the default Traefik; the
    ...    certificate-changed event must make the module fetch it and restart PDM.
    # Traefik verifies the chain of an uploaded certificate against the system
    # trust store, so the test creates a CA and trusts it for the duration of the test.
    Execute Command    openssl req -x509 -newkey rsa:2048 -nodes -keyout /tmp/renew-ca.key -out /tmp/renew-ca.crt -days 3 -subj "/CN=pdm-ci-ca" -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign"
    Execute Command    openssl req -newkey rsa:2048 -nodes -keyout /tmp/renew.key -out /tmp/renew.csr -subj "/CN=${HOST}"
    Execute Command    printf 'subjectAltName=DNS:${HOST}\nbasicConstraints=CA:FALSE\n' > /tmp/renew.ext
    Execute Command    openssl x509 -req -in /tmp/renew.csr -CA /tmp/renew-ca.crt -CAkey /tmp/renew-ca.key -CAcreateserial -days 3 -extfile /tmp/renew.ext -out /tmp/renew.crt
    ${rc} =    Execute Command    if [ -d /usr/local/share/ca-certificates ]; then cp /tmp/renew-ca.crt /usr/local/share/ca-certificates/pdm-ci-ca.crt && update-ca-certificates; else cp /tmp/renew-ca.crt /etc/pki/ca-trust/source/anchors/pdm-ci-ca.crt && update-ca-trust; fi
    ...    return_stdout=False    return_rc=True
    Should Be Equal As Integers    ${rc}    0
    ${expected} =    Execute Command    openssl x509 -in /tmp/renew.crt -noout -fingerprint -sha256
    ${cert} =    Execute Command    base64 -w0 /tmp/renew.crt
    ${key} =    Execute Command    base64 -w0 /tmp/renew.key
    ${payload} =    Evaluate    json.dumps({"certFile": $cert.strip(), "keyFile": $key.strip()})    modules=json
    ${output}    ${rc} =    Execute Command    api-cli run module/traefik1/upload-certificate --data '${payload}'
    ...    return_rc=True
    Execute Command    rm -f /usr/local/share/ca-certificates/pdm-ci-ca.crt /etc/pki/ca-trust/source/anchors/pdm-ci-ca.crt; (update-ca-certificates --fresh || update-ca-trust) >/dev/null 2>&1
    Should Be Equal As Integers    ${rc}    0    upload-certificate failed: ${output}
    TRY
        Wait Until Keyword Succeeds    180 seconds    5 seconds    Served certificate has fingerprint    ${expected.strip()}
    EXCEPT    AS    ${message}
        ${diag} =    Execute Command    echo "--- expected ${expected}"; echo "--- tls-certs:"; runagent -m ${module_id} sh -c 'ls -la tls-certs; openssl x509 -in tls-certs/cert.pem -noout -subject -fingerprint -sha256; ls -la ../events 2>&1; ls -la ../../imageroot/events/certificate-changed 2>&1' 2>&1; echo "--- agent journal:"; journalctl -q --no-pager -n 60 SYSLOG_IDENTIFIER=agent@${module_id} 2>&1 | cut -c1-240; echo "--- traefik get-certificate:"; api-cli run module/traefik1/get-certificate --data '{"fqdn":"${HOST}"}' 2>&1 | head -c 400
        Log    ${diag}    console=${True}
        Fail    ${message}
    END
    Wait until PDM is up
    ${code} =    Login status    ${PDM_PASSWORD_2}
    Should Be Equal    ${code}    200

Service recovers from SIGKILL
    # A backup copies the volumes while PDM runs, which is as consistent as a
    # crash. PDM must start cleanly from such a state.
    ${rc} =    Execute Command    runagent -m ${module_id} podman kill pdm
    ...    return_rc=True    return_stdout=False
    Should Be Equal As Integers    ${rc}    0
    Wait until module is up    ${module_id}
    ${base} =    Loopback URL of    ${module_id}
    Marker user exists    ${PDM_PASSWORD_2}    ${base}

Backup includes cover the state
    ${include} =    Execute Command    runagent -m ${module_id} sh -c 'cat ../etc/state-include.conf'
    Should Contain    ${include}    volumes/pdm-config
    Should Contain    ${include}    volumes/pdm-data
    Should Contain    ${include}    volumes/pdm-log
    Should Contain    ${include}    state/admin.env

Back up the module to the node repository
    ${uuid} =    Module environment    ${module_id}    MODULE_UUID
    ${node} =    Module environment    ${module_id}    NODE_ID
    Set Suite Variable    ${module_uuid}    ${uuid}
    Set Suite Variable    ${module_node}    ${node}
    ${ip} =    Execute Command    redis-cli hget node/${node}/vpn ip_address
    ${url} =    Set Variable    webdav:http://${ip.strip()}:4694
    ${repos} =    Run task    cluster/list-backup-repositories    {}
    ${found} =    Evaluate    [r['id'] for r in $repos['repositories'] if r['url'] == $url]
    IF    ${found}
        Set Suite Variable    ${repository}    ${found}[0]
    ELSE
        ${out} =    Run task    cluster/add-backup-repository
        ...    {"provider":"cluster","name":"pdm-test","url":"${url}","password":"","parameters":{}}
        Set Suite Variable    ${repository}    ${out}[id]
        Set Suite Variable    ${repository_created}    ${TRUE}
    END
    ${bid} =    Run task    cluster/add-backup
    ...    {"name":"pdm-test","instances":["${module_id}"],"repository":"${repository}","schedule":"*-12-31 03:17:00","retention":1,"enabled":true}
    Set Suite Variable    ${backup_id}    ${bid}
    Run task    cluster/run-backup    {"id":${backup_id}}
    ${snapshots} =    Run task    cluster/read-backup-snapshots
    ...    {"repository":"${repository}","path":"proxmox-datacenter-manager/${module_uuid}"}
    Should Not Be Empty    ${snapshots}
    Set Suite Variable    ${snapshot}    ${snapshots}[-1][id]

Restore the module in place
    ${old_id} =    Set Variable    ${module_id}
    ${out} =    Run task    cluster/restore-module
    ...    {"repository":"${repository}","path":"proxmox-datacenter-manager/${module_uuid}","snapshot":"${snapshot}","node":${module_node},"replace":true}
    Should Be Equal    ${out}[module_uuid]    ${module_uuid}
    Should Not Be Equal    ${out}[module_id]    ${old_id}
    Set Suite Variable    ${module_id}    ${out}[module_id]
    Set Suite Variable    ${web_port}    ${EMPTY}
    ${rc} =    Execute Command    runagent -m ${old_id} true    return_rc=True    return_stdout=False
    Should Not Be Equal As Integers    ${rc}    0    ${old_id} must be gone after a replace

The restored module serves the saved data
    Wait until module is up    ${module_id}
    ${base} =    Loopback URL of    ${module_id}
    # The password hash comes back with the backup (state/admin.env).
    ${code} =    Login status    ${PDM_PASSWORD_2}    ${base}
    Should Be Equal    ${code}    200
    Marker user exists    ${PDM_PASSWORD_2}    ${base}
    # Task history lives in the pdm-log volume: the node shell opened above.
    ${tasks} =    PDM api    ${PDM_PASSWORD_2}    ${base}    GET    /api2/json/nodes/localhost/tasks
    Should Contain    ${tasks}    termproxy

The restored module has its route again
    ${code} =    Login status    ${PDM_PASSWORD_2}    http://${HOST}    --resolve ${HOST}:80:127.0.0.1
    Should Be Equal    ${code}    200
    ${out} =    PDM client    ${PDM_PASSWORD_2}    http://127.0.0.1    shell    host=${HOST}
    Should Contain    ${out}    ws-ok

Clone the module
    ${out} =    Run task    cluster/clone-module    {"module":"${module_id}","node":${module_node},"replace":false}
    Set Suite Variable    ${clone_id}    ${out}[module_id]
    Should Not Be Equal    ${clone_id}    ${module_id}
    Wait until module is up    ${clone_id}
    ${base} =    Loopback URL of    ${clone_id}
    ${code} =    Login status    ${PDM_PASSWORD_2}    ${base}
    Should Be Equal    ${code}    200
    Marker user exists    ${PDM_PASSWORD_2}    ${base}

A clone does not take over the route of the source
    ${routes} =    Run task    module/traefik1/list-routes    {"expand_list":true}
    ${same} =    Evaluate    [r['instance'] for r in $routes if r.get('host') == $HOST]
    Log    routes for ${HOST}: ${same}    console=${True}
    Should Be Equal    ${same}    ${{ ['${module_id}'] }}

Remove the clone and the test backup
    IF    '${clone_id}' != ''
        Execute Command    remove-module --no-preserve ${clone_id}
    END
    IF    '${backup_id}' != ''
        Run task    cluster/remove-backup    {"id":${backup_id}}
    END
    IF    ${repository_created}
        Run task    cluster/remove-backup-repository    {"id":"${repository}"}
    END

Module UI loads in cluster-admin
    [Tags]    ui
    Import Library    Browser
    New Browser    chromium    headless=True
    New Context    ignoreHTTPSErrors=True
    Login to cluster-admin
    Go To    https://${NODE_ADDR}/cluster-admin/#/apps/${module_id}
    Wait For Elements State    iframe >>> h2 >> text="Status"    visible    timeout=20s
    Take Screenshot    filename=${OUTPUT DIR}/browser/screenshot/1._Status.png
    Go To    https://${NODE_ADDR}/cluster-admin/#/apps/${module_id}?page=settings
    Wait For Elements State    iframe >>> h2 >> text="Settings"    visible    timeout=20s
    # The heading renders even when module tasks fail; the host field is only
    # enabled and filled after get-configuration has completed
    Wait For Elements State    iframe >>> input[placeholder="pdm.example.org"]    enabled    timeout=30s
    Get Property    iframe >>> input[placeholder="pdm.example.org"]    value    ==    ${HOST}
    Take Screenshot    filename=${OUTPUT DIR}/browser/screenshot/2._Settings.png
    Close Browser

Remove module
    ${rc} =    Execute Command    remove-module --no-preserve ${module_id}
    ...    return_rc=True    return_stdout=False
    Should Be Equal As Integers    ${rc}    0
