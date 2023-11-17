var app = new Vue({
  el: '#app',
  data: {
    message: '',
    gamesList: [],
    deactivedList: [],
    selected: '',
    selectedActive: '',
    token: '',
    type: 'cocos-js',
    name: '',
    key: '',
    category: '',
    file: '',
    user: '',
    role: '',
    searchQuery: '',
  },
  computed: {
    // a computed getter
    isCanTest: function () {
      return this.selected !== '' && this.gamesList[this.selected];
    },
    isCanLoadRemote: function () {
      if (!this.isCanTest) return false;
      const { name, type } = this.gamesList[this.selected];
      return this.isAdmin && type !== 'cocos-js';
    },
    isCanDownload: function () {
      if (!this.isCanTest) return false;
      const { name, type } = this.gamesList[this.selected];
      return type === 'cocos-js' && this.isAdmin;
    },
    isAdmin: function () {
      return this.role === 'admin'
    },
    isCanDelete: function () {
      return this.isCanTest && this.isAdmin;
    },
    isCanActive: function () {
      return this.selectedActive !== '' && this.deactivedList[this.selectedActive];
    },
    filteredGames: function () {
      var self = this;
      return this.gamesList.filter(function (item) {
        return item.name.toLowerCase().indexOf(self.searchQuery.toLowerCase()) !== -1;
      });
    }
  },
  watch: {
    category: async function (val) {
      this.updateListActive();
    },
    key: async function (val) {
      this.updateListActive();
    },
  },
  async created() {
    this.loadGames();
    this.user = getCookie('name');
    this.role = getCookie('role');
  },
  methods: {
    async loadGames() {
      this.token = getCookie('token');
      this.updateListActive();
      const responseDeactive = await fetch(`/games?token=${this.token}&type=&active=false`);
      this.deactivedList = await responseDeactive.json();
      // console.log('create', myJson);
    },
    async updateListActive() {
      const response = await fetch(`/games?token=${this.token}&type=${this.category}&key=${this.key}&active=true`);
      const myJson = await response.json();
      this.gamesList = [...myJson];
    },
    async testGame() {
      /* if (!this.isCanTest) {
        return;
      }
      console.log('his.gamesList ', this.selected, this.token);
      const { name, type } = this.gamesList[this.selected];
      console.log(name, type);
      window.open(`/${type}/${name}`); */
      if (!this.isCanTest) {
        return;
      }
      const selectedGame = this.gamesList[this.selected];
      const { _id: selected, name, type } = selectedGame;
      console.log(selected, name, type);

      // Tạo yêu cầu GET từ trình duyệt đến endpoint /testGame
      // window.location.href = `/testGame?selected=${selected}&token=${this.token}`;
      // Sử dụng window.open() để mở tab mới
      const newTab = window.open(`/testGame?selected=${selected}&token=${this.token}`, '_blank');
      newTab.focus();
      // Sử dụng window.location.reload() để làm mới trang
      // window.location.reload();
    },
    async hotUpdate() {
      if (!this.token) {
        alert('Please enter token.');
        return;
      }
      // console.log('his.gamesList ', this.selected, this.token);
      const { name, type } = this.gamesList[this.selected];
      const response = await fetch(`/testGames?name=${name}&type=${type}&token=${this.token}`);
      const myJson = await response.text();
      alert(`Test ${type} Game: ${name} -> ${myJson}`);
    },
    async loadRemote() {
      if (!this.token) {
        alert('Please enter token.');
        return;
      }
      // console.log('his.gamesList ', this.selected, this.token);
      // const { id, type, name } = this.gamesList[this.selected];
      const { _id: id, type, name } = this.gamesList[this.selected];
      const response = await fetch(`/games/${id}/hot-load?token=${this.token}`);
      const myJson = await response.text();
      alert(`Load Remote ${type} Game: ${name}`);
      this.message = myJson;
    },
    async downloadGameArchive() {
      if (!this.token) {
        alert('Please enter token.');
        return;
      }
      // console.log('his.gamesList ', this.selected, this.token);
      const { name, type } = this.gamesList[this.selected];
      const response = await fetch(`/game_archive?name=${name}&token=${this.token}`);
      const data = await response.blob();
      var fileName = `${name}.zip`;
      saveAs(data, fileName);
    },
    uploadGame() {
      if (!this.file) {
        // Kiểm tra nếu không có tệp nào được chọn
        alert('Vui lòng tải tệp nén (file Zip) lên.');
        return;
      }

      if (!this.name) {
        // Kiểm tra nếu trường 'name' không được nhập
        alert('Vui lòng nhập tên trò chơi.');
        return;
      }

      const form_data = new FormData();
      form_data.append("file", this.file, `${this.name}.zip`);
      form_data.append("type", this.type);
      form_data.append("name", this.name);
      const request_config = {
        method: "post",
        url: 'public/upload_game', // /upload_game
        data: form_data
      };
      axios.defaults.headers.post['Content-Type'] = 'multipart/form-data';
      axios.defaults.headers.post['Authorization'] = "Bearer " + this.token;
      axios(request_config)
        .then((res) => {
          console.log(res.data);
          if (res.data.message === 'Cập nhật tệp thành công') {
            alert("Cập nhật tệp thành công.");
          } else {
            alert("Tải lên tệp thành công.");
          }
          // this.loadGames();
          // Sử dụng window.location.reload() để làm mới trang
          window.location.reload();
        }).catch(err => {
          console.log(err.message)
        });
    },
    async activeGame() {
      const { id } = this.deactivedList[this.selectedActive];
      const request_config = {
        method: "post",
        url: `/games/active?id=${id}&token=${this.token}`,
      };
      axios.defaults.headers.post['Authorization'] = "Bearer " + this.token;
      try {
        const res = await axios(request_config)
        console.log(res.data)
        this.selectedActive = '';
        this.loadGames();
      } catch (error) {
        console.log(error.message)
      }
    },
    async deleteGame() {
      // const { id } = this.gamesList[this.selected];
      const { _id: id } = this.gamesList[this.selected];
      // console.log(id);
      const request_config = {
        method: "delete",
        url: `/games?id=${id}&token=${this.token}`,
      };
      // console.log(request_config);
      axios.defaults.headers.post['Authorization'] = "Bearer " + this.token;
      try {
        const res = await axios(request_config)
        console.log(res.data)
        alert("Xóa tệp trò chơi thành công.");
        this.selected = '';
        // this.loadGames();
        // Sử dụng window.location.reload() để làm mới trang
        window.location.reload();
      } catch (error) {
        console.log(error.message)
      }
    },
    handleFileUpload() {
      this.file = this.$refs.file.files[0];
    }
  }
});