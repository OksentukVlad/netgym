// Approved round 5 purpose inventory. Reused by cards and learned script notes.
export const setupPurpose = {
  "dr-1": {
    "hostname": "назва пристрою (і частина назви ключа)",
    "domain": "домен — потрібен, щоб створити ключ SSH",
    "crypto": "створює RSA-ключі пристрою для SSH",
    "ssh-version": "дозволяє лише SSH версії 2",
    "enable-secret": "пароль до привілейованого режиму #",
    "username": "локальний користувач для входу",
    "password-encryption": "маскує паролі в конфігурації (слабко)",
    "transport-ssh": "вхід на вибрані лінії VTY лише через SSH",
    "login-local": "вхід за локальними користувачами",
    "ip-address": "адреса інтерфейсу",
    "no-shutdown": "вмикає інтерфейс",
    "write-memory": "зберігає поточні налаштування для запуску"
  },
  "dr-2": {
    "hostname": "назва комутатора",
    "svi-address": "адреса керування на інтерфейсі VLAN",
    "svi-up": "вмикає інтерфейс VLAN керування",
    "default-gateway": "шлюз для керування з інших мереж",
    "write-memory": "зберігає поточні налаштування для запуску"
  },
  "dr-3": {
    "bridge": "створює міст для LAN",
    "bridge-port": "порт ether2 у міст — міст має вже бути",
    "list": "створює список інтерфейсів LAN",
    "list-member": "міст у список LAN — потрібні обидва",
    "address": "адреса LAN на мосту — міст має вже бути",
    "user": "створює нового адміністратора",
    "checkpoint": "перевір, що новий вхід працює",
    "admin-off": "вимикає типовий обліковий запис admin",
    "services": "вимикає непотрібні служби керування",
    "mac-telnet-off": "вимикає MAC-Telnet на всіх інтерфейсах",
    "mac-server": "MAC-Winbox лише з LAN — потрібен список",
    "discovery": "виявлення сусідів у LAN — потрібен список",
    "ssh-strong": "посилює криптографічні налаштування SSH"
  }
};
